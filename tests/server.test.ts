import { describe, expect, it, vi } from 'vitest';
import plugin from '../server/index.js';

// The server half, against a stubbed Strapi. These are the tests for the things that went wrong
// once and would go wrong silently again: which API a mutation goes through, and what a row is
// allowed to claim.

const ACTION_UID = 'plugin::publisher.action';

type Entry = { documentId: string; title?: string; updatedAt?: string; locale?: string };

/**
 * A Strapi with just enough in it. `entries` is keyed `uid|locale|status` so a test can say that a
 * document exists in one locale and not another, which is the whole point of half of them.
 */
function fakeStrapi({
  actions = [],
  entries = {},
  contentTypes = { 'api::article.article': { info: { displayName: 'Article' } } },
  actionService,
  defaultLocale = 'en-GB',
}: {
  actions?: Array<Record<string, unknown>>;
  entries?: Record<string, Entry[]>;
  contentTypes?: Record<string, unknown>;
  actionService?: Record<string, unknown>;
  defaultLocale?: string | null;
} = {}) {
  const documents = vi.fn((uid: string) => ({
    findMany: vi.fn(async (params: any) => {
      if (uid === ACTION_UID) return actions;
      const wanted = params?.filters?.documentId?.$in ?? [];
      const pool = entries[`${uid}|${params?.locale ?? ''}|${params?.status}`] ?? [];
      return pool.filter((entry) => wanted.includes(entry.documentId));
    }),
    findOne: vi.fn(async ({ documentId }: { documentId: string }) =>
      actions.find((action: any) => action.documentId === documentId) ?? null,
    ),
    update: vi.fn(async () => ({ executeAt: 'written-by-document-service' })),
    delete: vi.fn(async () => ({})),
  }));

  return {
    documents,
    contentType: (uid: string) => contentTypes[uid],
    plugin: (name: string) => {
      if (name === 'i18n') return { service: () => ({ getDefaultLocale: async () => defaultLocale }) };
      if (name === 'publisher' && actionService) return { service: () => actionService };
      return undefined;
    },
    log: { warn: vi.fn() },
  };
}

function fakeCtx(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    request: { body: {} },
    body: undefined as unknown,
    badRequest: vi.fn(function (this: any, message: string) { this.body = { error: message }; this.status = 400; }),
    notFound: vi.fn(function (this: any, message: string) { this.body = { error: message }; this.status = 404; }),
    serviceUnavailable: vi.fn(function (this: any, message: string) { this.body = { error: message }; this.status = 503; }),
    ...overrides,
  } as any;
}

const board = (strapi: unknown) => plugin.controllers.board({ strapi } as never);

const anAction = (over: Record<string, unknown> = {}) => ({
  documentId: 'act1',
  executeAt: '2030-01-01T10:00:00.000Z',
  mode: 'publish',
  entityId: 'doc1',
  entitySlug: 'api::article.article',
  locale: null,
  ...over,
});

describe('queue', () => {
  it('says scheduling is unavailable rather than throwing when publisher has gone', async () => {
    const strapi = fakeStrapi({ contentTypes: {} });
    const ctx = fakeCtx();

    await board(strapi).queue(ctx);

    expect(ctx.body).toEqual({ data: [], available: false });
  });

  it('skips rows it cannot make sense of instead of rendering blanks', async () => {
    const strapi = fakeStrapi({
      actions: [anAction(), anAction({ documentId: 'act2', executeAt: null }), anAction({ documentId: 'act3', entityId: null })],
      contentTypes: { [ACTION_UID]: {}, 'api::article.article': { info: { displayName: 'Article' } } },
    });
    const ctx = fakeCtx();

    await board(strapi).queue(ctx);

    expect((ctx.body as any).data).toHaveLength(1);
  });

  // The bug this exists for: an entry that lives only in a non-default locale was looked up in the
  // default one, found nothing, and the board showed a raw document id where a title belongs.
  it('resolves a title in the locale the job is for', async () => {
    const strapi = fakeStrapi({
      actions: [anAction({ locale: 'en-US' })],
      contentTypes: { [ACTION_UID]: {}, 'api::article.article': { info: { displayName: 'Article' } } },
      entries: {
        'api::article.article|en-US|draft': [{ documentId: 'doc1', title: 'US only' }],
        'api::article.article||draft': [],
      },
    });
    const ctx = fakeCtx();

    await board(strapi).queue(ctx);

    expect((ctx.body as any).data[0].label).toBe('US only');
    expect((ctx.body as any).data[0].locale).toBe('en-US');
  });

  it('keeps two locales of one document apart', async () => {
    const strapi = fakeStrapi({
      actions: [anAction({ documentId: 'act1', locale: 'en-GB' }), anAction({ documentId: 'act2', locale: 'en-US' })],
      contentTypes: { [ACTION_UID]: {}, 'api::article.article': { info: { displayName: 'Article' } } },
      entries: {
        'api::article.article|en-GB|draft': [{ documentId: 'doc1', title: 'British title' }],
        'api::article.article|en-US|draft': [{ documentId: 'doc1', title: 'American title' }],
      },
    });
    const ctx = fakeCtx();

    await board(strapi).queue(ctx);

    expect((ctx.body as any).data.map((row: any) => row.label)).toEqual(['British title', 'American title']);
  });

  it('never reads admin types, whatever an action points at', async () => {
    const strapi = fakeStrapi({
      actions: [anAction({ entitySlug: 'admin::user' })],
      contentTypes: { [ACTION_UID]: {}, 'admin::user': { info: { displayName: 'User' } } },
      entries: { 'admin::user||draft': [{ documentId: 'doc1', title: 'a person' }] },
    });
    const ctx = fakeCtx();

    await board(strapi).queue(ctx);

    expect((ctx.body as any).data[0].label).toBe('doc1');
  });

  describe('what a job will actually do', () => {
    const withState = async (mode: string, draft: Entry | null, published: Entry | null) => {
      const strapi = fakeStrapi({
        actions: [anAction({ mode })],
        contentTypes: { [ACTION_UID]: {}, 'api::article.article': { info: { displayName: 'Article' } } },
        entries: {
          'api::article.article||draft': draft ? [draft] : [],
          'api::article.article||published': published ? [published] : [],
        },
      });
      const ctx = fakeCtx();
      await board(strapi).queue(ctx);
      return (ctx.body as any).data[0];
    };

    it('publishes a draft that is not live', async () => {
      const row = await withState('publish', { documentId: 'doc1', title: 'x', updatedAt: '2030-01-01' }, null);
      expect(row).toMatchObject({ live: false, outcome: 'publish' });
    });

    // Publisher skips this one and deletes the action anyway, so "will publish" was a promise
    // nothing kept.
    it('changes nothing when the entry is already live and untouched since', async () => {
      const row = await withState(
        'publish',
        { documentId: 'doc1', title: 'x', updatedAt: '2030-01-01T00:00:00.000Z' },
        { documentId: 'doc1', title: 'x', updatedAt: '2030-01-01T00:00:00.000Z' },
      );
      expect(row).toMatchObject({ live: true, outcome: 'none' });
    });

    it('publishes again when the draft has moved on since it went live', async () => {
      const row = await withState(
        'publish',
        { documentId: 'doc1', title: 'x', updatedAt: '2030-01-02T00:00:00.000Z' },
        { documentId: 'doc1', title: 'x', updatedAt: '2030-01-01T00:00:00.000Z' },
      );
      expect(row).toMatchObject({ live: true, outcome: 'publish' });
    });

    it('changes nothing when asked to take down something that is not live', async () => {
      const row = await withState('unpublish', { documentId: 'doc1', title: 'x' }, null);
      expect(row).toMatchObject({ live: false, outcome: 'none' });
    });
  });
});

describe('reschedule', () => {
  const publisherPresent = { [ACTION_UID]: {}, 'api::article.article': { info: { displayName: 'Article' } } };

  // The one that matters. Publisher keeps a timer per job in memory and only its own action service
  // moves it, so a reschedule written straight to the table changes the date on screen and leaves
  // the entry going out at the old time.
  it('goes through the publisher action service, not the document service', async () => {
    const service = { update: vi.fn(async () => ({ executeAt: 'moved' })), delete: vi.fn(async () => ({})) };
    const strapi = fakeStrapi({ actions: [anAction()], contentTypes: publisherPresent, actionService: service });
    const ctx = fakeCtx({ params: { id: 'act1' }, request: { body: { executeAt: '2030-06-01T09:00:00.000Z' } } });

    await board(strapi).reschedule(ctx);

    expect(service.update).toHaveBeenCalledWith('act1', { data: { executeAt: '2030-06-01T09:00:00.000Z' } });
    expect((ctx.body as any).data.executeAt).toBe('moved');
  });

  it('falls back to the document service if that service is ever renamed away', async () => {
    const strapi = fakeStrapi({ actions: [anAction()], contentTypes: publisherPresent });
    const ctx = fakeCtx({ params: { id: 'act1' }, request: { body: { executeAt: '2030-06-01T09:00:00.000Z' } } });

    await board(strapi).reschedule(ctx);

    expect((ctx.body as any).data.executeAt).toBe('written-by-document-service');
  });

  it('refuses a date in the past, which publisher would never start a timer for', async () => {
    const service = { update: vi.fn(), delete: vi.fn() };
    const strapi = fakeStrapi({ actions: [anAction()], contentTypes: publisherPresent, actionService: service });
    const ctx = fakeCtx({ params: { id: 'act1' }, request: { body: { executeAt: '2001-01-01T00:00:00.000Z' } } });

    await board(strapi).reschedule(ctx);

    expect(ctx.badRequest).toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it('refuses something that is not a date', async () => {
    const strapi = fakeStrapi({ actions: [anAction()], contentTypes: publisherPresent });
    const ctx = fakeCtx({ params: { id: 'act1' }, request: { body: { executeAt: 'next tuesday-ish' } } });

    await board(strapi).reschedule(ctx);

    expect(ctx.badRequest).toHaveBeenCalled();
  });

  it('answers 404 for a job that has run or been cancelled in another tab', async () => {
    const strapi = fakeStrapi({ actions: [], contentTypes: publisherPresent });
    const ctx = fakeCtx({ params: { id: 'gone' }, request: { body: { executeAt: '2030-06-01T09:00:00.000Z' } } });

    await board(strapi).reschedule(ctx);

    expect(ctx.notFound).toHaveBeenCalled();
  });

  it('answers 503 rather than erroring when publisher is not enabled', async () => {
    const strapi = fakeStrapi({ contentTypes: {} });
    const ctx = fakeCtx({ params: { id: 'act1' }, request: { body: { executeAt: '2030-06-01T09:00:00.000Z' } } });

    await board(strapi).reschedule(ctx);

    expect(ctx.serviceUnavailable).toHaveBeenCalled();
  });
});

describe('cancel', () => {
  const publisherPresent = { [ACTION_UID]: {}, 'api::article.article': { info: { displayName: 'Article' } } };

  it('goes through the publisher action service so the timer is dropped too', async () => {
    const service = { update: vi.fn(), delete: vi.fn(async () => ({})) };
    const strapi = fakeStrapi({ actions: [anAction()], contentTypes: publisherPresent, actionService: service });
    const ctx = fakeCtx({ params: { id: 'act1' } });

    await board(strapi).cancel(ctx);

    expect(service.delete).toHaveBeenCalledWith('act1');
  });

  it('answers 404 for a job that is already gone', async () => {
    const strapi = fakeStrapi({ actions: [], contentTypes: publisherPresent });
    const ctx = fakeCtx({ params: { id: 'gone' } });

    await board(strapi).cancel(ctx);

    expect(ctx.notFound).toHaveBeenCalled();
  });
});

describe('bootstrap', () => {
  it('registers the permission the routes ask for', async () => {
    const registerMany = vi.fn();
    const strapi = { admin: { services: { permission: { actionProvider: { registerMany } } } }, log: { warn: vi.fn() } };

    plugin.bootstrap({ strapi } as never);

    expect(registerMany).toHaveBeenCalledWith([
      { section: 'plugins', displayName: 'Access the schedule board', uid: 'read', pluginName: 'schedule-board' },
    ]);
  });

  // Registering reaches into an admin internal. A rename there must not stop the CMS booting.
  it('warns rather than throwing if the admin internal it uses has moved', () => {
    const warn = vi.fn();
    const strapi = { admin: undefined, log: { warn } };

    expect(() => plugin.bootstrap({ strapi } as never)).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe('routes', () => {
  it('asks for the permission that bootstrap registers, on every route', () => {
    for (const route of plugin.routes.admin.routes) {
      expect(route.config.auth.scope).toEqual(['plugin::schedule-board.read']);
    }
  });

  it('exposes nothing on the public content API', () => {
    expect(Object.keys(plugin.routes)).toEqual(['admin']);
    expect(plugin.routes.admin.type).toBe('admin');
  });
});
