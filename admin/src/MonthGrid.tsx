import { Box, Button, Flex, Typography } from '@strapi/design-system';
import * as React from 'react';
import { dayKey, entryState, jobIntent, type QueueRow } from './use-queue';

// A month at a time, so "what goes out next week" is one glance rather than arithmetic over a list.
// Weeks start on Monday, which is how a UK editorial week is read.
//
// Cells are deliberately shallow. An earlier version gave every day the same generous height
// whether or not anything happened in it, so a month holding four jobs was six rows of empty boxes
// and the four things that mattered were lost among them. A day grows only when it holds something.

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Monday of the week the first falls in, through to the Sunday that completes the last week, so the
// grid is always whole weeks and never a ragged edge.
function daysOfMonth(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));

  const days: Date[] = [];
  const cursor = new Date(start);
  while (days.length < 42) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    if (days.length % 7 === 0 && cursor.getMonth() !== month.getMonth() && cursor > first) break;
  }
  return days;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function MonthGrid({ rows, onSelect }: { rows: QueueRow[]; onSelect: (row: QueueRow) => void }) {
  const [month, setMonth] = React.useState(() => new Date());

  const byDay = React.useMemo(() => {
    const map = new Map<string, QueueRow[]>();
    for (const row of rows) {
      const key = dayKey(new Date(row.executeAt));
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  }, [rows]);

  const days = daysOfMonth(month);
  const today = dayKey(new Date());
  const step = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
  const countThisMonth = days
    .filter((day) => day.getMonth() === month.getMonth())
    .reduce((total, day) => total + (byDay.get(dayKey(day))?.length ?? 0), 0);

  return (
    <Box background="neutral0" hasRadius padding={6} shadow="tableShadow">
      <Flex justifyContent="space-between" alignItems="center" paddingBottom={5}>
        <Flex gap={3} alignItems="baseline">
          <Typography variant="delta">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Typography>
          <Typography variant="pi" textColor="neutral500">
            {countThisMonth === 0 ? 'nothing scheduled' : countThisMonth === 1 ? '1 job' : `${countThisMonth} jobs`}
          </Typography>
        </Flex>
        <Flex gap={2}>
          <Button variant="tertiary" onClick={() => step(-1)}>
            Previous
          </Button>
          <Button variant="tertiary" onClick={() => setMonth(new Date())}>
            Today
          </Button>
          <Button variant="tertiary" onClick={() => step(1)}>
            Next
          </Button>
        </Flex>
      </Flex>

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
        {DAY_NAMES.map((name) => (
          <Box key={name} paddingBottom={2}>
            <Typography variant="sigma" textColor="neutral500">
              {name}
            </Typography>
          </Box>
        ))}

        {days.map((day) => {
          const key = dayKey(day);
          const entries = byDay.get(key) ?? [];
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = key === today;
          return (
            <Box
              key={key}
              padding={2}
              hasRadius
              background={isToday ? 'primary100' : entries.length > 0 ? 'neutral0' : 'neutral100'}
              borderColor={isToday ? 'primary200' : 'neutral150'}
              borderWidth="1px"
              borderStyle="solid"
              style={{ minHeight: entries.length > 0 ? '76px' : '44px', opacity: inMonth ? 1 : 0.45 }}
            >
              <Typography
                variant="pi"
                fontWeight={isToday ? 'bold' : undefined}
                textColor={isToday ? 'primary600' : 'neutral600'}
              >
                {day.getDate()}
              </Typography>
              <Flex direction="column" alignItems="stretch" gap={1} paddingTop={1}>
                {entries.map((row) => (
                  <Box
                    key={row.documentId}
                    tag="button"
                    onClick={() => onSelect(row)}
                    paddingLeft={2}
                    paddingRight={2}
                    paddingTop={1}
                    paddingBottom={1}
                    hasRadius
                    background={row.mode === 'unpublish' ? 'warning100' : 'success100'}
                    title={`${timeOf(row.executeAt)} ${row.label}. ${entryState(row)}, ${jobIntent(row).toLowerCase()}. Click to reschedule.`}
                    style={{ border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  >
                    <Typography variant="pi" textColor={row.mode === 'unpublish' ? 'warning700' : 'success700'} ellipsis>
                      {timeOf(row.executeAt)} {row.label}
                    </Typography>
                  </Box>
                ))}
              </Flex>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
