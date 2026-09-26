import { QueueRow } from './use-queue';
import * as React from 'react';
export declare function RescheduleDialog({ row, onClose, onSave, }: {
    row: QueueRow | null;
    onClose: () => void;
    onSave: (documentId: string, when: Date) => Promise<void>;
}): React.JSX.Element;
