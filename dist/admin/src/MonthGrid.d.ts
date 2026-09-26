import { QueueRow } from './use-queue';
import * as React from 'react';
export declare function MonthGrid({ rows, defaultLocale, onSelect, }: {
    rows: QueueRow[];
    defaultLocale: string | null;
    onSelect: (row: QueueRow) => void;
}): React.JSX.Element;
