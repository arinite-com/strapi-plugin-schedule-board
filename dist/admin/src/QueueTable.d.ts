import { QueueRow } from './use-queue';
import * as React from 'react';
export declare function QueueTable({ rows, defaultLocale, onCancel, onEdit, }: {
    rows: QueueRow[];
    defaultLocale: string | null;
    onCancel: (id: string) => void;
    onEdit: (row: QueueRow) => void;
}): React.JSX.Element;
