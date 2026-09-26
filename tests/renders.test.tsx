import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Does it render, and does it say the right thing?
//
// The rest of the suite tests functions. This renders the two views, which catches the class of
// mistake the others cannot: a component that throws, or one that renders but puts the wrong
// sentence in front of an editor. Both have happened here.
//
// The design system is stubbed rather than imported. `@strapi/design-system` 2.x and its own
// dependencies publish CommonJS while declaring `"type": "module"`, which Node's ESM loader refuses
// and which only works inside Strapi's Vite build. Chasing that through every transitive package
// bought nothing: what is worth testing is this plugin's own logic and wording, and a stub exercises
// all of it. It cannot catch misuse of a real design-system prop, so the colour and spacing tokens
// these components pass are checked against the published theme by hand when they change.

const passthrough = (tag: string) => {
  const C = ({ children }: { children?: React.ReactNode }) => React.createElement(tag, null, children);
  C.displayName = tag;
  return C;
};

vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => ({ get: vi.fn(), del: vi.fn(), put: vi.fn() }) }));

vi.mock('@strapi/icons', () => ({
  Calendar: passthrough('svg'),
  Pencil: passthrough('svg'),
  Trash: passthrough('svg'),
  ArrowClockwise: passthrough('svg'),
}));

vi.mock('@strapi/design-system', () => {
  // `title` and `href` are kept, because rows are asserted on them. Everything else is styling.
  const Box = ({ children, tag, title, href }: any) =>
    React.createElement(tag === 'button' ? 'button' : 'div', { title, href }, children);
  const Typography = ({ children, tag, href }: any) =>
    React.createElement(tag === 'a' ? 'a' : 'span', { href }, children);
  const Flex = ({ children, title }: any) => React.createElement('div', { title }, children);

  return {
    Box,
    Flex,
    Typography,
    Button: ({ children, href }: any) => React.createElement('button', { 'data-href': href }, children),
    IconButton: ({ children, label }: any) => React.createElement('button', { 'aria-label': label }, children),
    EmptyStateLayout: ({ content, action }: any) => React.createElement('div', null, content, action),
    Table: passthrough('table'),
    Thead: passthrough('thead'),
    Tbody: passthrough('tbody'),
    Tr: passthrough('tr'),
    Th: passthrough('th'),
    Td: ({ children }: any) => React.createElement('td', null, children),
    Alert: ({ children, title }: any) => React.createElement('div', { title }, children),
    Tabs: { Root: passthrough('div'), List: passthrough('div'), Trigger: passthrough('button'), Content: passthrough('div') },
    Modal: { Root: passthrough('div'), Content: passthrough('div'), Header: passthrough('div'), Body: passthrough('div'), Footer: passthrough('div'), Title: passthrough('h2'), Close: passthrough('div') },
    Field: { Root: passthrough('div'), Label: passthrough('label'), Error: passthrough('span'), Hint: passthrough('span') },
    DateTimePicker: () => React.createElement('input', { type: 'datetime-local' }),
  };
});

const { MonthGrid } = await import('../admin/src/MonthGrid');
const { QueueTable } = await import('../admin/src/QueueTable');
type QueueRow = import('../admin/src/use-queue').QueueRow;

const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  documentId: 'act1',
  executeAt: new Date(Date.now() + 3600_000).toISOString(),
  mode: 'publish',
  entityId: 'doc1',
  entitySlug: 'api::article.article',
  locale: null,
  contentType: 'Article',
  label: 'A post about ladders',
  live: false,
  outcome: 'publish',
  ...over,
});

const queue = (rows: QueueRow[], defaultLocale: string | null = 'en-GB') =>
  renderToStaticMarkup(<QueueTable rows={rows} defaultLocale={defaultLocale} onCancel={() => {}} onEdit={() => {}} />);

const month = (rows: QueueRow[], defaultLocale: string | null = 'en-GB') =>
  renderToStaticMarkup(<MonthGrid rows={rows} defaultLocale={defaultLocale} onSelect={() => {}} />);

describe('QueueTable', () => {
  it('renders a job with its title and what it will do', () => {
    const html = queue([row()]);
    expect(html).toContain('A post about ladders');
    expect(html).toContain('Draft, will publish');
  });

  it('says a live entry is coming down, not going up', () => {
    expect(queue([row({ mode: 'unpublish', live: true, outcome: 'unpublish' })])).toContain('Live, will unpublish');
  });

  // The row that used to lie.
  it('does not promise a change on a job that will make none', () => {
    const html = queue([row({ live: true, outcome: 'none' })]);
    expect(html).toContain('Live, no change');
    expect(html).not.toContain('will publish');
  });

  it('explains on hover why a job will change nothing', () => {
    expect(queue([row({ live: true, outcome: 'none' })])).toContain('already live');
  });

  // The chip beside the content type, not the link. The link carries the locale either way, which is
  // the point of it, so asserting on the whole markup would pass for the wrong reason.
  it('names a locale beside the type only when it is not the default', () => {
    expect(queue([row({ locale: 'en-US' })])).toContain('· en-US');
    expect(queue([row({ locale: 'en-GB' })])).not.toContain('· en-GB');
    expect(queue([row({ locale: null })])).toContain('<span>Article</span>');
  });

  it('links a row to its entry in the right locale, default or not', () => {
    expect(queue([row({ locale: 'en-US' })])).toContain('doc1?plugins[i18n][locale]=en-US');
    expect(queue([row({ locale: 'en-GB' })])).toContain('doc1?plugins[i18n][locale]=en-GB');
    expect(queue([row()])).toContain('/admin/content-manager/collection-types/api::article.article/doc1"');
  });

  it('offers somewhere to go when nothing is scheduled', () => {
    const html = queue([]);
    expect(html).toContain('Nothing is scheduled');
    expect(html).toContain('/admin/content-manager');
  });

  it('groups rows under a day heading', () => {
    expect(queue([row()])).toMatch(/Today|Tomorrow/);
  });
});

describe('MonthGrid', () => {
  it('renders the month and the job inside it', () => {
    const html = month([row()]);
    expect(html).toContain('A post about ladders');
    expect(html).toContain(new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
  });

  it('renders an empty month without falling over', () => {
    expect(month([])).toContain('nothing scheduled');
  });

  it('tells the reader in the tooltip that a job will do nothing', () => {
    expect(month([row({ live: true, outcome: 'none' })])).toContain('Live, no change');
  });

  it('starts its weeks on Monday', () => {
    const html = month([]);
    expect(html.indexOf('Mon')).toBeLessThan(html.indexOf('Sun'));
  });
});
