import { describe, expect, it, vi } from 'vitest';

// The helpers under test are pure, but they share a module with the hook that fetches them their
// rows, and importing that pulls the whole Strapi admin runtime into the test. Only the hook needs
// it, and the hook is not what is being tested here.
vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => ({ get: vi.fn(), del: vi.fn(), put: vi.fn() }) }));

import {
  dayKey,
  entryUrl,
  groupByDay,
  jobIntent,
  showsLocale,
  whenFromNow,
  type QueueRow,
} from '../admin/src/use-queue';

// The pure half of the admin. No DOM, no Strapi: just the functions that decide what a row says and
// which day it belongs to, both of which have been wrong before.

const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  documentId: 'act1',
  executeAt: '2030-01-01T10:00:00.000Z',
  mode: 'publish',
  entityId: 'doc1',
  entitySlug: 'api::article.article',
  locale: null,
  contentType: 'Article',
  label: 'A post',
  live: false,
  outcome: 'publish',
  ...over,
});

describe('dayKey', () => {
  // The bug: keying cells with toISOString put local midnight on the previous day anywhere ahead of
  // UTC, so the calendar filed jobs a day early and disagreed with the queue about the same row.
  it('uses local date parts, so a local midnight stays on its own day', () => {
    const localMidnight = new Date(2030, 0, 1, 0, 0, 0);
    expect(dayKey(localMidnight)).toBe('2030-01-01');
  });

  it('pads months and days so keys sort and compare as strings', () => {
    expect(dayKey(new Date(2030, 8, 5, 12))).toBe('2030-09-05');
  });
});

describe('groupByDay', () => {
  it('keeps one group per day, in the order the rows arrive', () => {
    const groups = groupByDay([
      row({ documentId: 'a', executeAt: new Date(2030, 0, 1, 9).toISOString() }),
      row({ documentId: 'b', executeAt: new Date(2030, 0, 1, 17).toISOString() }),
      row({ documentId: 'c', executeAt: new Date(2030, 0, 2, 9).toISOString() }),
    ]);

    expect(groups.map((group) => group.rows.length)).toEqual([2, 1]);
    expect(groups[0].key).toBe('2030-01-01');
  });

  it('has nothing to group when there is nothing scheduled', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('whenFromNow', () => {
  it('counts a job that is due as due, not as negative minutes', () => {
    expect(whenFromNow(new Date(Date.now() - 60_000).toISOString())).toBe('due now');
  });

  it('reads in minutes, then hours, then days', () => {
    expect(whenFromNow(new Date(Date.now() + 10 * 60_000).toISOString())).toBe('in 10 min');
    expect(whenFromNow(new Date(Date.now() + 3 * 3600_000).toISOString())).toBe('in 3 hours');
    expect(whenFromNow(new Date(Date.now() + 5 * 86400_000).toISOString())).toBe('in 5 days');
  });

  it('says one hour, not one hours', () => {
    expect(whenFromNow(new Date(Date.now() + 3600_000).toISOString())).toBe('in 1 hour');
  });
});

describe('jobIntent', () => {
  it('speaks in the future, so it cannot be read as the entry state', () => {
    expect(jobIntent(row({ outcome: 'publish' }))).toBe('Will publish');
    expect(jobIntent(row({ outcome: 'unpublish' }))).toBe('Will unpublish');
  });

  it('does not promise a change that publisher will skip', () => {
    expect(jobIntent(row({ outcome: 'none' }))).toBe('No change');
  });
});

describe('showsLocale', () => {
  it('stays quiet about the locale everything is in anyway', () => {
    expect(showsLocale(row({ locale: 'en-GB' }), 'en-GB')).toBe(false);
    expect(showsLocale(row({ locale: null }), 'en-GB')).toBe(false);
  });

  it('names the locale when it is not the default one', () => {
    expect(showsLocale(row({ locale: 'en-US' }), 'en-GB')).toBe(true);
  });
});

describe('entryUrl', () => {
  it('carries the locale, or the link opens a different entry under the same id', () => {
    expect(entryUrl(row({ locale: 'en-US' }))).toBe(
      '/admin/content-manager/collection-types/api::article.article/doc1?plugins[i18n][locale]=en-US',
    );
  });

  it('leaves the query off when there is no locale to carry', () => {
    expect(entryUrl(row())).toBe('/admin/content-manager/collection-types/api::article.article/doc1');
  });
});
