import { Button, DateTimePicker, Field, Flex, Modal, Typography } from '@strapi/design-system';
import * as React from 'react';
import type { QueueRow } from './use-queue';

// Changing when a job runs. The server does the keeping-in-step: publisher holds a timer per job as
// well as a row, and both have to move together, so this dialog only has to send the new date.
//
// A past date is refused rather than accepted, because publisher will not start a timer for one.
// The job would sit there looking scheduled and only go out when the CMS next restarted.
export function RescheduleDialog({
  row,
  onClose,
  onSave,
}: {
  row: QueueRow | null;
  onClose: () => void;
  onSave: (documentId: string, when: Date) => Promise<void>;
}) {
  const [when, setWhen] = React.useState<Date | undefined>();
  const [saving, setSaving] = React.useState(false);

  // Reopen on a different row and the picker should start from that row's time, not the last one's.
  React.useEffect(() => {
    setWhen(row ? new Date(row.executeAt) : undefined);
  }, [row]);

  const inPast = when ? when.getTime() < Date.now() : false;

  const save = async () => {
    if (!row || !when) return;
    setSaving(true);
    try {
      await onSave(row.documentId, when);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal.Root open={Boolean(row)} onOpenChange={(open: boolean) => (open ? undefined : onClose())}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>Reschedule</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={3}>
            <Typography textColor="neutral600">{row?.label}</Typography>
            <Field.Root name="executeAt" error={inPast ? 'Pick a time in the future.' : undefined}>
              <Field.Label>{row?.mode === 'unpublish' ? 'Unpublish at' : 'Publish at'}</Field.Label>
              <DateTimePicker value={when} onChange={setWhen} />
              <Field.Error />
            </Field.Root>
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Modal.Close>
            <Button variant="tertiary">Cancel</Button>
          </Modal.Close>
          <Button onClick={save} loading={saving} disabled={!when || inPast}>
            Save
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
