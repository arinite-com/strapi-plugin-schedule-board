import { Alert, Box, Button, Tabs } from '@strapi/design-system';
import { ArrowClockwise } from '@strapi/icons';
import { Layouts, Page } from '@strapi/strapi/admin';
import * as React from 'react';
import { MonthGrid } from './MonthGrid';
import { BOARD_PERMISSIONS } from './permissions';
import { QueueTable } from './QueueTable';
import { RescheduleDialog } from './RescheduleDialog';
import { useQueue, type QueueRow } from './use-queue';

// Hiding the menu link is not access control: the URL still works if you type it. This turns that
// into Strapi's own "you do not have access" page rather than a board that loads and then fails
// every request behind it.
export default function ScheduleBoardPage() {
  return (
    <Page.Protect permissions={BOARD_PERMISSIONS}>
      <Board />
    </Page.Protect>
  );
}

// Two views over the same pending work: a queue to act on it, a calendar to see its shape.
// Publisher deletes an action once it has run, so both are lists of what is still to come. There is
// deliberately no history: that would mean recording executed actions ourselves.
function Board() {
  const { rows, defaultLocale, status, cancel, reschedule, reload } = useQueue();
  const [editing, setEditing] = React.useState<QueueRow | null>(null);

  if (status === 'loading') return <Page.Loading />;
  if (status === 'error') return <Page.Error />;

  if (status === 'unavailable') {
    return (
      <Layouts.Root>
        <Page.Title>Schedule</Page.Title>
        <Layouts.Header title="Schedule" subtitle="Scheduling is switched off" />
        <Layouts.Content>
          <Alert title="The publisher plugin is not enabled" variant="default" closeLabel="Close">
            Scheduled publishing comes from strapi-plugin-publisher. Enable it in config/plugins.ts and
            restart, and everything waiting to go out will appear here.
          </Alert>
        </Layouts.Content>
      </Layouts.Root>
    );
  }

  // The header answers the question somebody opened this page with, rather than counting rows at them.
  const next = rows[0];
  const subtitle = next
    ? `${rows.length === 1 ? '1 job' : `${rows.length} jobs`} waiting, next is "${next.label}"`
    : 'Nothing waiting to go out';

  return (
    <Layouts.Root>
      <Page.Title>Schedule</Page.Title>
      <Layouts.Header
        title="Schedule"
        subtitle={subtitle}
        primaryAction={
          <Button variant="tertiary" startIcon={<ArrowClockwise />} onClick={reload}>
            Refresh
          </Button>
        }
      />
      <Layouts.Content>
        <Tabs.Root defaultValue="queue">
          <Tabs.List aria-label="Queue or calendar">
            <Tabs.Trigger value="queue">Queue</Tabs.Trigger>
            <Tabs.Trigger value="calendar">Calendar</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="queue">
            <QueueTable rows={rows} defaultLocale={defaultLocale} onCancel={cancel} onEdit={setEditing} />
          </Tabs.Content>
          <Tabs.Content value="calendar">
            <Box paddingTop={4}>
              <MonthGrid rows={rows} defaultLocale={defaultLocale} onSelect={setEditing} />
            </Box>
          </Tabs.Content>
        </Tabs.Root>
      </Layouts.Content>

      <RescheduleDialog row={editing} onClose={() => setEditing(null)} onSave={reschedule} />
    </Layouts.Root>
  );
}
