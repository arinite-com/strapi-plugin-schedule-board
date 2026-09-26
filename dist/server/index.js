"use strict";
Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: "Module" } });
const ACTION_UID = "plugin::publisher.action";
const SCOPE = "plugin::schedule-board.read";
const publisherPresent = (strapi) => Boolean(strapi.contentType(ACTION_UID));
function actionService(strapi) {
  const publisher = strapi.plugin("publisher");
  const service = publisher && publisher.service("action");
  const usableService = service && typeof service.update === "function" && typeof service.delete === "function";
  return usableService ? service : null;
}
const GONE = "That job is no longer scheduled. It may have run, or been cancelled elsewhere.";
const stillScheduled = async (strapi, documentId) => Boolean(await strapi.documents(ACTION_UID).findOne({ documentId }));
const usable = (action) => Boolean(action && action.executeAt && action.entitySlug && action.entityId && !Number.isNaN(new Date(action.executeAt).getTime()));
const LABEL_FIELDS = ["title", "name", "heading", "question", "slug"];
function labelOf(entry, documentId) {
  if (!entry) return documentId;
  const field = LABEL_FIELDS.find((name) => typeof entry[name] === "string" && entry[name]);
  return field ? entry[field] : documentId;
}
async function defaultLocaleOf(strapi) {
  try {
    const i18n = strapi.plugin("i18n");
    const service = i18n && i18n.service("locales");
    return service ? await service.getDefaultLocale() : null;
  } catch {
    return null;
  }
}
const keyOf = (action) => `${action.entitySlug}:${action.entityId}:${action.locale || ""}`;
function outcomeOf(mode, state) {
  if (mode === "unpublish") return state.live ? "unpublish" : "none";
  if (!state.live || state.modified) return "publish";
  return "none";
}
async function describe(strapi, actions) {
  const groups = /* @__PURE__ */ new Map();
  for (const action of actions) {
    const groupKey = `${action.entitySlug}:${action.locale || ""}`;
    const group = groups.get(groupKey) || { uid: action.entitySlug, locale: action.locale || void 0, ids: [] };
    group.ids.push(action.entityId);
    groups.set(groupKey, group);
  }
  const labels = /* @__PURE__ */ new Map();
  const typeNames = /* @__PURE__ */ new Map();
  const states = /* @__PURE__ */ new Map();
  for (const { uid, locale, ids } of groups.values()) {
    if (uid.startsWith("admin::")) continue;
    const schema = strapi.contentType(uid);
    typeNames.set(uid, schema && schema.info && schema.info.displayName || uid);
    if (!schema) continue;
    const scope = { filters: { documentId: { $in: ids } } };
    if (locale) scope.locale = locale;
    const drafts = await strapi.documents(uid).findMany({ ...scope, status: "draft" });
    const published = await strapi.documents(uid).findMany({ ...scope, status: "published" });
    const publishedById = new Map(published.map((entry) => [entry.documentId, entry]));
    for (const draft of drafts) {
      const key = `${uid}:${draft.documentId}:${locale || ""}`;
      labels.set(key, labelOf(draft, draft.documentId));
      const live = publishedById.get(draft.documentId);
      states.set(key, {
        live: Boolean(live),
        modified: Boolean(live && draft.updatedAt && live.updatedAt && draft.updatedAt > live.updatedAt)
      });
    }
  }
  return { labels, typeNames, states };
}
const index = {
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
          section: "plugins",
          displayName: "Access the schedule board",
          uid: "read",
          pluginName: "schedule-board"
        }
      ]);
    } catch (error) {
      strapi.log.warn(
        `[schedule-board] could not register its permission, so only super admins will reach the board: ${error.message}`
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
        const all = await strapi.documents(ACTION_UID).findMany({ sort: "executeAt:asc" });
        const actions = all.filter(usable);
        const { labels, typeNames, states } = await describe(strapi, actions);
        ctx.body = {
          available: true,
          // Sent once so a row can stay quiet about the ordinary case: a locale is worth showing
          // when it is not the one everything is in anyway.
          defaultLocale: await defaultLocaleOf(strapi),
          data: actions.map((action) => {
            const state = states.get(keyOf(action)) || { live: false, modified: false };
            return {
              documentId: action.documentId,
              executeAt: action.executeAt,
              mode: action.mode,
              entityId: action.entityId,
              entitySlug: action.entitySlug,
              locale: action.locale || null,
              contentType: typeNames.get(action.entitySlug) || action.entitySlug,
              label: labels.get(keyOf(action)) || action.entityId,
              live: state.live,
              outcome: outcomeOf(action.mode, state)
            };
          })
        };
      },
      async cancel(ctx) {
        if (!publisherPresent(strapi)) {
          ctx.serviceUnavailable("Scheduling is unavailable: the publisher plugin is not enabled.");
          return;
        }
        if (!await stillScheduled(strapi, ctx.params.id)) {
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
          ctx.serviceUnavailable("Scheduling is unavailable: the publisher plugin is not enabled.");
          return;
        }
        const executeAt = ctx.request.body && ctx.request.body.executeAt;
        if (!executeAt || Number.isNaN(new Date(executeAt).getTime())) {
          ctx.badRequest("executeAt must be a date");
          return;
        }
        if (new Date(executeAt).getTime() <= Date.now()) {
          ctx.badRequest("executeAt must be in the future.");
          return;
        }
        if (!await stillScheduled(strapi, ctx.params.id)) {
          ctx.notFound(GONE);
          return;
        }
        const data = { executeAt: new Date(executeAt).toISOString() };
        const service = actionService(strapi);
        const updated = service ? await service.update(ctx.params.id, { data }) : await strapi.documents(ACTION_UID).update({ documentId: ctx.params.id, data });
        ctx.body = { data: { documentId: ctx.params.id, executeAt: updated.executeAt } };
      }
    })
  },
  routes: {
    admin: {
      type: "admin",
      routes: [
        { method: "GET", path: "/queue", handler: "board.queue", config: { policies: [], auth: { scope: [SCOPE] } } },
        { method: "DELETE", path: "/queue/:id", handler: "board.cancel", config: { policies: [], auth: { scope: [SCOPE] } } },
        { method: "PUT", path: "/queue/:id", handler: "board.reschedule", config: { policies: [], auth: { scope: [SCOPE] } } }
      ]
    }
  }
};
exports.default = index;
