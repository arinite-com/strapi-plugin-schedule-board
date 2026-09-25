// The server half of the Schedule board: one admin route answering "what is still to come".
//
// It exists because publisher's action table is deliberately hidden from the content manager
// (`pluginOptions['content-manager'].visible = false`), so nothing the admin already has will list
// it. Reading it here also lets a row reach the browser already readable: an action stores only a
// content-type uid and a document id, and a board showing "api::article.article / hvx045..." would
// be no use to anybody.
//
// JavaScript rather than TypeScript, because there is nothing here a type would have caught: the
// shapes it handles belong to another plugin's table and to Strapi's own registries, and both are
// `any` from here whatever we declare.

const ACTION_UID = 'plugin::publisher.action';

// Stated once and shared by every route, so the permission the routes demand and the permission
// bootstrap registers can never drift apart.
const SCOPE = 'plugin::schedule-board.read';

// Everything here reads a table that belongs to another plugin, so the first question any handler
// asks is whether that plugin is still there. Disable or remove publisher and this used to throw,
// which turned the whole page into Strapi's error screen. The CMS itself was never at risk, it
// boots and runs fine without us, but a dependency vanishing should read as "scheduling is off",
// not as something broken.
const publisherPresent = (strapi) => Boolean(strapi.contentType(ACTION_UID));

// Publisher does not sweep its table on a timer. It holds one in-memory cron per action and moves
// or drops that cron only from its own action service. Writing to the table directly would change
// the date the board displays while the original cron went on to fire at the original time, so
// every mutation goes through that service. The document service stays as the fallback for the day
// the service is renamed: the row is then still correct, and publisher rebuilds its crons from the
// table on the next boot.
function actionService(strapi) {
  const publisher = strapi.plugin('publisher');
  const service = publisher && publisher.service('action');
  const usableService = service && typeof service.update === 'function' && typeof service.delete === 'function';
  return usableService ? service : null;
}

// Two people can have the board open, and the job one of them is editing may be the job the other
// just cancelled, or one that ran a second ago. Asking first turns that race into a plain "it has
// gone" rather than the 500 the underlying update throws on a document that is not there.
const GONE = 'That job is no longer scheduled. It may have run, or been cancelled elsewhere.';

const stillScheduled = async (strapi, documentId) =>
  Boolean(await strapi.documents(ACTION_UID).findOne({ documentId }));

// A row we cannot make sense of is skipped rather than rendered as undefined. If publisher ever
// renames these fields, the board empties instead of showing rows of blanks and Invalid Date.
const usable = (action) =>
  Boolean(action && action.executeAt && action.entitySlug && action.entityId && !Number.isNaN(new Date(action.executeAt).getTime()));

// Content types name their human field differently and no schema flag reliably marks it, so take
// the first one the entry actually has. The document id is the honest fallback, never a blank cell.
const LABEL_FIELDS = ['title', 'name', 'heading', 'question', 'slug'];

function labelOf(entry, documentId) {
  if (!entry) return documentId;
  const field = LABEL_FIELDS.find((name) => typeof entry[name] === 'string' && entry[name]);
  return field ? entry[field] : documentId;
}

// One read per content type rather than one per action: thirty scheduled posts across three types
// cost three queries, not thirty.
async function describe(strapi, actions) {
  const idsByType = new Map();
  for (const action of actions) {
    const ids = idsByType.get(action.entitySlug) || [];
    ids.push(action.entityId);
    idsByType.set(action.entitySlug, ids);
  }

  const labels = new Map();
  const typeNames = new Map();
  const live = new Set();

  for (const [uid, ids] of idsByType) {
    // `entitySlug` is data, and the same registry that holds articles also holds the admin's own
    // types: users, roles, API tokens. Anyone who can create an action could point one at those and
    // have the board read them back. A board for scheduled content never looks outside content.
    if (uid.startsWith('admin::')) continue;

    const schema = strapi.contentType(uid);
    typeNames.set(uid, (schema && schema.info && schema.info.displayName) || uid);
    if (!schema) continue;

    // The draft always exists, so it is what the title comes from.
    const drafts = await strapi.documents(uid).findMany({
      filters: { documentId: { $in: ids } },
      status: 'draft',
    });
    for (const entry of drafts) {
      labels.set(`${uid}:${entry.documentId}`, labelOf(entry, entry.documentId));
    }

    // Whether a published version exists too, so the board can say where a job is taking the entry
    // rather than only what it will do: "Draft, will publish" reads very differently from
    // "Live, will come down".
    const published = await strapi.documents(uid).findMany({
      filters: { documentId: { $in: ids } },
      status: 'published',
    });
    for (const entry of published) {
      live.add(`${uid}:${entry.documentId}`);
    }
  }

  return { labels, typeNames, live };
}

export default {
  // Declaring the permission is what lets Settings > Roles grant or withhold this page. Without it
  // the route's auto-generated scope matches no action, which a super admin sails through and
  // everybody else is refused by, so the board silently worked for one person only.
  //
  // Wrapped because this reaches into an internal of the admin package. A rename there would
  // otherwise throw during bootstrap and stop the whole CMS starting over a menu entry, which is
  // far too much to lose for one page's permission.
  bootstrap({ strapi }) {
    try {
      strapi.admin.services.permission.actionProvider.registerMany([
        {
          section: 'plugins',
          displayName: 'Access the schedule board',
          uid: 'read',
          pluginName: 'schedule-board',
        },
      ]);
    } catch (error) {
      strapi.log.warn(
        `[schedule-board] could not register its permission, so only super admins will reach the board: ${error.message}`,
      );
    }
  },

  controllers: {
    board: ({ strapi }) => ({
      async queue(ctx) {
        if (!publisherPresent(strapi)) {
          ctx.body = { data: [], available: false };
          return;
        }
        const all = await strapi.documents(ACTION_UID).findMany({ sort: 'executeAt:asc' });
        const actions = all.filter(usable);
        const { labels, typeNames, live } = await describe(strapi, actions);

        ctx.body = {
          available: true,
          data: actions.map((action) => ({
            documentId: action.documentId,
            executeAt: action.executeAt,
            mode: action.mode,
            entityId: action.entityId,
            entitySlug: action.entitySlug,
            contentType: typeNames.get(action.entitySlug) || action.entitySlug,
            label: labels.get(`${action.entitySlug}:${action.entityId}`) || action.entityId,
            live: live.has(`${action.entitySlug}:${action.entityId}`),
          })),
        };
      },

      async cancel(ctx) {
        if (!publisherPresent(strapi)) {
          ctx.serviceUnavailable('Scheduling is unavailable: the publisher plugin is not enabled.');
          return;
        }
        if (!(await stillScheduled(strapi, ctx.params.id))) {
          ctx.notFound(GONE);
          return;
        }

        const service = actionService(strapi);
        if (service) await service.delete(ctx.params.id);
        else await strapi.documents(ACTION_UID).delete({ documentId: ctx.params.id });

        ctx.body = { data: { documentId: ctx.params.id } };
      },

      // Move a job to a different moment.
      async reschedule(ctx) {
        if (!publisherPresent(strapi)) {
          ctx.serviceUnavailable('Scheduling is unavailable: the publisher plugin is not enabled.');
          return;
        }
        const executeAt = ctx.request.body && ctx.request.body.executeAt;
        if (!executeAt || Number.isNaN(new Date(executeAt).getTime())) {
          ctx.badRequest('executeAt must be a date');
          return;
        }
        // Publisher will not start a timer for a past date, so accepting one would leave a job
        // sitting in the queue looking scheduled and going out only at the next restart.
        if (new Date(executeAt).getTime() <= Date.now()) {
          ctx.badRequest('executeAt must be in the future.');
          return;
        }

        if (!(await stillScheduled(strapi, ctx.params.id))) {
          ctx.notFound(GONE);
          return;
        }

        const data = { executeAt: new Date(executeAt).toISOString() };
        const service = actionService(strapi);
        const updated = service
          ? await service.update(ctx.params.id, { data })
          : await strapi.documents(ACTION_UID).update({ documentId: ctx.params.id, data });

        ctx.body = { data: { documentId: ctx.params.id, executeAt: updated.executeAt } };
      },
    }),
  },

  routes: {
    admin: {
      type: 'admin',
      routes: [
        { method: 'GET', path: '/queue', handler: 'board.queue', config: { policies: [], auth: { scope: [SCOPE] } } },
        { method: 'DELETE', path: '/queue/:id', handler: 'board.cancel', config: { policies: [], auth: { scope: [SCOPE] } } },
        { method: 'PUT', path: '/queue/:id', handler: 'board.reschedule', config: { policies: [], auth: { scope: [SCOPE] } } },
      ],
    },
  },
};
