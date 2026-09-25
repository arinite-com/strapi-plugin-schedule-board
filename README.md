# Schedule board

A queue and a calendar for the entries `strapi-plugin-publisher` is holding to publish later.

Publisher does the scheduling and does it well, but it ships no overview: `addMenuLink` and
`injectComponent` both appear zero times in its bundle, so a date could be set on an entry and then
nothing anywhere answered "what goes out this week". This adds that one screen and changes nothing
else.

A **Schedule** item appears in the admin menu. It lists everything still to come, soonest first,
grouped into Today / Tomorrow / the rest, with a month view beside it. Each row says where the entry
stands and what the job will do to it, in one phrase: "Draft, will publish", "Live, will unpublish".
Jobs can be moved or cancelled from either view.

## Requirements

Strapi 5, and [`strapi-plugin-publisher`](https://github.com/PluginPal/strapi-plugin-publisher) 2.x,
which does the actual scheduling. This plugin reads and edits publisher's queue; it schedules
nothing itself.

## Install

```bash
pnpm add strapi-plugin-publisher github:arinite-com/strapi-plugin-schedule-board
```

Then enable both in `config/plugins.ts`:

```ts
export default {
  publisher: { enabled: true },
  'schedule-board': { enabled: true },
};
```

Rebuild the admin (`strapi build`) and the menu item appears.

## Permissions

The plugin registers one RBAC action, so **Settings > Roles > Plugins > Schedule** offers "Access
the schedule board". Grant it to any role that should see what is queued; super admins have it
already.

Scheduling itself stays publisher's, in the content manager, under publisher's own rules. This
plugin only shows and edits the resulting queue.

## What a row claims

A row says where the entry stands and what running the job will actually change, as one phrase:
"Draft, will publish", "Live, will unpublish", "Live, no change".

The third one is not padding. Publisher deletes an action once its moment arrives whether or not it
had anything to do, and it skips a publish whose entry is already live and unedited since, and an
unpublish on something that was never live. Those jobs run, change nothing, and vanish. The board
works out which ones they are by comparing the draft against the published version, greys them, and
says why on hover, rather than promising a change that nothing will make.

## Locales

A job belongs to one locale, and so does the entry it names: the same document id is a different
entry with a different title in each. Every lookup here carries the job's locale, the link to the
entry carries it too, and a row names its locale when it is not the default one. On an install with
one locale, or none, nothing changes and no row mentions a locale at all.

## Tests

`pnpm test`. No DOM and no running Strapi: the controllers run against a stubbed `strapi`, and the
admin's pure helpers run on their own.

They exist for the mistakes that have already been made once here, all of which were silent: a
mutation going to the wrong API, a lookup forgetting its locale, a date keyed in UTC, a row
promising a change nothing would make. Each of those has a test that fails if it comes back.

## Why it is a plugin and not a page

It needs its own admin route. Publisher's action table is deliberately hidden from the content
manager (`pluginOptions['content-manager'].visible = false`), so no endpoint the admin already has
will list it: the content-manager API answers 403 for `plugin::publisher.action`, and publisher's
own `GET /publisher/actions` answers 404. A server route of our own is the only way in, and an
admin-authenticated route means a plugin.

Reading it server-side also means a row reaches the browser already readable. An action stores only
a content-type uid and a document id, so the server resolves the entry's title, one query per
content type rather than one per action.

## Two things that will waste your afternoon

**The server entry must be `strapi-server.js`, plain JavaScript, at the plugin root.** Strapi
resolves it with the `require` condition and falls back to `./strapi-server.js`. When that file is
missing it does not warn, it `continue`s: the plugin loads as nothing at all, the admin half still
builds, and the routes simply never exist. That is why this half is JS while the admin half is TSX.

**`addMenuLink` rejects `React.lazy`**, whatever its published type says
(`Component?: React.LazyExoticComponent<React.ComponentType>`). The runtime wants a function
returning a promise of a module with a default export, and throws an invariant naming the fix:
`Component: () => import(path)`.

## Layout

```
strapi-server.js             the entry Strapi falls back to
server/index.js              GET /schedule-board/queue, DELETE /queue/:id, PUT /queue/:id
admin/index.tsx              registers the menu link
admin/ScheduleBoard.tsx      the page: header, tabs, dialog state
admin/QueueTable.tsx         one table, grouped into days
admin/MonthGrid.tsx          the month view
admin/RescheduleDialog.tsx   moving a job to a different time
admin/use-queue.ts           fetching, grouping, and "in 3 days"
admin/permissions.ts         the one permission, named once
```

## Who can see it

`bootstrap` registers one RBAC action, `plugin::schedule-board.read`, so the board appears in
Settings > Roles as "Access the schedule board" and can be granted or withheld like anything else.
Three places have to agree about it and all three name it from one constant: the routes enforce it
through `auth.scope`, the menu link hides without it, and the page wraps itself in `Page.Protect`
because hiding a link is not access control when the URL still works.

Registering it is what makes the routes meaningful. Strapi generates a scope from the handler name
either way, and an unregistered scope matches no action: a super admin sails through it and
everybody else is refused, so the board silently worked for exactly one person.

The registration is wrapped in a `try`. It reaches into an internal of the admin package, and a
rename there would otherwise throw during bootstrap and stop the whole CMS starting over one menu
entry. If it ever fails the plugin logs a warning and falls back to super-admin-only, which is where
it started.

## Things learned by looking at it

**Dates must be keyed on local parts, never `toISOString()`.** The grid's cells are local midnight,
which in any timezone ahead of UTC is the previous day, so every cell was keyed a day early: the
"today" highlight and the jobs both landed on tomorrow, and the queue and the calendar disagreed
about the same row.

**One table, not one per day group.** Rendering a table per group repeated the column headers down
the page and let each group size its own columns, so nothing lined up. The day is a full-width row
inside a single table instead.

**`Badge` uppercases its content** and renders it small and pale, which makes a title unreadable at
calendar-cell width. Calendar entries are a plain tinted box.

**Empty days should be shallow.** Giving every cell the same generous height meant a month holding
four jobs was six rows of empty boxes with the four things that mattered lost among them.

## A job is a row AND a timer, and both have to move

The most expensive thing to get wrong here, and the reason cancel and reschedule do not write to
the table directly.

Publisher 2.0.9 does not sweep its table on a schedule. On boot it reads every action once and
calls `strapi.cron.add` for each future one, a single-shot timer per job named
`publisherAction_<documentId>`; after that, timers are created, moved and dropped only by its own
`action` service, whose `create`, `update` and `delete` wrap the core service with
`scheduleCronJob` and `removeCronJob`. (`config.actions.syncFrequency` is still in its config
schema and is no longer read by anything.)

So the row is not the schedule. It is the record the schedule is rebuilt from at boot. Writing
`executeAt` with `strapi.documents(...)`, which is what this plugin used to do, moves the record
and leaves the timer where it was. The board would then show the new date while the old timer still
fired at the old one, and the task it runs re-reads the action and publishes without ever comparing
the time, so the entry went out at the moment the editor had just moved it away from. Silent, and
invisible in development, because every code edit restarts the CMS and a restart rebuilds the
timers from the rows and makes it right again. In production nothing restarts.

Both mutations therefore go through `strapi.plugin('publisher').service('action')`, with the
document service kept only as a fallback if that service is ever renamed: the row would still be
correct, and publisher would pick it up on the next boot.

Cancelling was safe either way, by luck rather than design: the timer's task reloads the action
first and skips when it has gone. It still goes through the service so the timer is dropped then
rather than left to fire into nothing.

**Past dates are refused**, in the dialog and again in the route. `scheduleCronJob` logs a warning
and returns without creating a timer when the date has passed, so a job scheduled into the past
sits in the queue looking scheduled and goes out at the next restart, whenever that is.

## Deliberately not here

**History.** Publisher deletes an action once it has run, so the table is a queue of what is still
to come, not a record of what went out. Showing history would mean recording executed actions
ourselves, which is a second table and a decision nobody has asked for yet.

## What happens if publisher changes or goes away

Measured, not assumed, by disabling publisher and restarting.

**The CMS is never at risk.** It boots and runs normally without publisher. This plugin touches
publisher's data only inside request handlers, never at load or bootstrap, so a missing dependency
cannot stop Strapi starting.

**The board degrades instead of erroring.** Every handler checks `strapi.contentType()` for
publisher's action type first. Missing, and the queue answers `{ data: [], available: false }` and
the page says scheduling is switched off; the mutations answer 503 with the same explanation. Before
that guard existed the route threw a 500 and the page showed Strapi's error screen, which reads as
"something is broken" rather than "this is turned off".

**A renamed field empties the board rather than filling it with rubbish.** Rows missing
`executeAt`, `entitySlug` or `entityId`, or carrying an unparseable date, are skipped. If publisher
ever renames them, the board goes quiet instead of rendering rows of `undefined` and `Invalid Date`.

**But disabling publisher DESTROYS every pending job.** This is the one that bites. With three jobs
queued, switching publisher off and restarting left the `actions` table present and empty. The
schedule is gone, and re-enabling the plugin does not bring it back. Nothing this plugin does causes
that and nothing it does can prevent it: the data belongs to publisher's content type, and Strapi
clears it when the content type stops being declared. Treat "disable publisher" as "cancel
everything scheduled", and drain or note the queue first.

## If it earns its place

Extract it to the org as a package that depends on publisher, rather than forking publisher. The
engine is 45 releases of somebody else's maintained code and its peer deps pin
`@strapi/design-system`, which breaks between Strapi majors. Owning one screen is the cheap half.
Fork only if the engine itself needs changing: approval before a scheduled publish, per-role
permission on who may schedule, finer cron granularity.
