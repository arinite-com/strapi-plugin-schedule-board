import { useFetchClient } from '@strapi/strapi/admin';
import * as React from 'react';

// The board's data: everything publisher is still holding, soonest first, already readable.
// Rows are enriched on the server, so nothing here has to turn a uid into English.

export type QueueRow = {
  documentId: string;
  executeAt: string;
  mode: string;
  entityId: string;
  entitySlug: string;
  contentType: string;
  label: string;
  live: boolean;
};

// What a job will DO, said as a future, because "Publish" on its own reads as a state and looks
// exactly like Strapi's own published chip sitting next to a title.
export const jobIntent = (row: QueueRow) => (row.mode === 'unpublish' ? 'Will unpublish' : 'Will publish');

// Where the entry stands right now, which is the other half of the sentence.
export const entryState = (row: QueueRow) => (row.live ? 'Live' : 'Draft');

// `available` is false when publisher is switched off, and the rows are then empty rather than
// missing, so the page can say so instead of showing an error.
type QueueResponse = { data?: QueueRow[]; available?: boolean };

export function useQueue() {
  const { get, del, put } = useFetchClient();
  const [rows, setRows] = React.useState<QueueRow[]>([]);
  // "unavailable" is its own state, not an error: publisher being switched off is a configuration
  // fact the page can explain, while an error screen would suggest something is broken.
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');

  const load = React.useCallback(async () => {
    try {
      const { data } = await get<QueueResponse>('/schedule-board/queue');
      setRows(data.data ?? []);
      setStatus(data.available === false ? 'unavailable' : 'ready');
    } catch {
      setStatus('error');
    }
  }, [get]);

  React.useEffect(() => {
    load();
  }, [load]);

  const cancel = React.useCallback(
    async (documentId: string) => {
      await del(`/schedule-board/queue/${documentId}`);
      await load();
    },
    [del, load],
  );

  const reschedule = React.useCallback(
    async (documentId: string, executeAt: Date) => {
      await put(`/schedule-board/queue/${documentId}`, { executeAt: executeAt.toISOString() });
      await load();
    },
    [put, load],
  );

  return { rows, status, reload: load, cancel, reschedule };
}

// "in 3 days", "in 2 hours", "due now". A scheduled job is only interesting relative to now, and an
// absolute timestamp alone makes the reader do the arithmetic.
export function whenFromNow(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutes < 0) return 'due now';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `in ${Math.round(hours / 24)} days`;
}

// Local date parts, never toISOString: local midnight is the previous day in UTC anywhere ahead of
// it, which silently files a job under the wrong date.
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// A schedule is read as "today, tomorrow, then the rest", so that is how the queue is grouped.
export function dayHeading(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (dayKey(date) === dayKey(today)) return 'Today';
  if (dayKey(date) === dayKey(tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function groupByDay(rows: QueueRow[]) {
  const groups: Array<{ heading: string; key: string; rows: QueueRow[] }> = [];
  for (const row of rows) {
    const key = dayKey(new Date(row.executeAt));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, heading: dayHeading(row.executeAt), rows: [row] });
  }
  return groups;
}

// Where the entry lives in the content manager, so a row can be opened rather than hunted for.
export const entryUrl = (row: QueueRow) =>
  `/admin/content-manager/collection-types/${row.entitySlug}/${row.entityId}`;
