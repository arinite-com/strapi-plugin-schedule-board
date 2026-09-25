import { Box, Button, EmptyStateLayout, Flex, IconButton, Table, Tbody, Td, Th, Thead, Tr, Typography } from '@strapi/design-system';
import { Calendar, Pencil, Trash } from '@strapi/icons';
import * as React from 'react';
import {
  entryState,
  entryUrl,
  groupByDay,
  jobIntent,
  noChangeReason,
  showsLocale,
  whenFromNow,
  type QueueRow,
} from './use-queue';

// The queue: everything still to come, grouped by day.
//
// Four columns, not five. An earlier version gave the title its own wide column and then stranded
// the type and the countdown far across the page, so a short headline left a lane of empty table
// between itself and the rest of its own row. What a row is about now travels together.
//
// The wording matters more than it looks. A chip reading "Publish" beside a title is the same
// shape as Strapi's own published state, so it reads as "this is published" when it means "this
// will be published". Every row states the entry's state and what running it will change, as one
// phrase: "Draft, will publish", "Live, will unpublish", "Live, no change".

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const DOT_COLOUR = { publish: 'success500', unpublish: 'warning500', none: 'neutral400' } as const;

// A job that will change nothing is greyed rather than hidden: it is still going to run and still
// going to disappear afterwards, so the reader needs to see it, just not to expect anything of it.
function Intent({ row }: { row: QueueRow }) {
  const doesNothing = row.outcome === 'none';
  return (
    <Flex gap={2} alignItems="center" title={doesNothing ? noChangeReason(row) : undefined}>
      <Box aria-hidden style={{ width: 6, height: 6, borderRadius: 999 }} background={DOT_COLOUR[row.outcome]} />
      <Typography variant="pi" textColor={doesNothing ? 'neutral500' : 'neutral700'}>
        {entryState(row)}, {jobIntent(row).toLowerCase()}
      </Typography>
    </Flex>
  );
}

export function QueueTable({
  rows,
  defaultLocale,
  onCancel,
  onEdit,
}: {
  rows: QueueRow[];
  defaultLocale: string | null;
  onCancel: (id: string) => void;
  onEdit: (row: QueueRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <Box background="neutral0" hasRadius padding={8} shadow="tableShadow">
        <EmptyStateLayout
          icon={<Calendar width="10rem" />}
          content="Nothing is scheduled. Open any entry, set a publish date, and it will wait here until it goes out."
          action={
            <Button variant="secondary" tag="a" href="/admin/content-manager">
              Go to Content Manager
            </Button>
          }
        />
      </Box>
    );
  }

  const groups = groupByDay(rows);

  return (
    <Table colCount={4} rowCount={rows.length + groups.length}>
      <Thead>
        <Tr>
          <Th>
            <Typography variant="sigma">When</Typography>
          </Th>
          <Th>
            <Typography variant="sigma">What</Typography>
          </Th>
          <Th>
            <Typography variant="sigma">Outcome</Typography>
          </Th>
          <Th>
            <Typography variant="sigma">Actions</Typography>
          </Th>
        </Tr>
      </Thead>
      <Tbody>
        {groups.map((group) => (
          <React.Fragment key={group.key}>
            {/* A quiet label, not a filled bar: the day is a divider, not a row of data. */}
            <Tr>
              <Td colSpan={4}>
                <Flex gap={2} alignItems="baseline" paddingTop={2} paddingBottom={1}>
                  <Typography variant="sigma" textColor="neutral600">
                    {group.heading}
                  </Typography>
                  <Typography variant="pi" textColor="neutral500">
                    {group.rows.length === 1 ? '1 job' : `${group.rows.length} jobs`}
                  </Typography>
                </Flex>
              </Td>
            </Tr>

            {group.rows.map((row) => (
              <Tr key={row.documentId}>
                <Td>
                  <Flex direction="column" alignItems="flex-start">
                    <Typography variant="omega" fontWeight="bold">
                      {timeOf(row.executeAt)}
                    </Typography>
                    <Typography variant="pi" textColor="neutral500">
                      {whenFromNow(row.executeAt)}
                    </Typography>
                  </Flex>
                </Td>
                <Td>
                  <Flex direction="column" alignItems="flex-start">
                    <Typography variant="omega" fontWeight="semiBold" tag="a" href={entryUrl(row)} textColor="primary600">
                      {row.label}
                    </Typography>
                    <Typography variant="pi" textColor="neutral500">
                      {row.contentType}
                      {showsLocale(row, defaultLocale) ? ` · ${row.locale}` : ''}
                    </Typography>
                  </Flex>
                </Td>
                <Td>
                  <Intent row={row} />
                </Td>
                <Td>
                  <Flex gap={1} justifyContent="flex-end">
                    <IconButton label="Reschedule" onClick={() => onEdit(row)}>
                      <Pencil />
                    </IconButton>
                    <IconButton label="Cancel this job" variant="danger-light" onClick={() => onCancel(row.documentId)}>
                      <Trash />
                    </IconButton>
                  </Flex>
                </Td>
              </Tr>
            ))}
          </React.Fragment>
        ))}
      </Tbody>
    </Table>
  );
}
