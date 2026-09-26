export type QueueRow = {
    documentId: string;
    executeAt: string;
    mode: string;
    entityId: string;
    entitySlug: string;
    locale: string | null;
    contentType: string;
    label: string;
    live: boolean;
    outcome: 'publish' | 'unpublish' | 'none';
};
export declare const jobIntent: (row: QueueRow) => "No change" | "Will unpublish" | "Will publish";
export declare const noChangeReason: (row: QueueRow) => "This entry is not live, so there is nothing to take down. The job will run and change nothing." | "This entry is already live and has not been edited since, so there is nothing to publish. The job will run and change nothing.";
export declare const entryState: (row: QueueRow) => "Live" | "Draft";
export declare function useQueue(): {
    rows: QueueRow[];
    defaultLocale: string | null;
    status: "loading" | "ready" | "unavailable" | "error";
    reload: () => Promise<void>;
    cancel: (documentId: string) => Promise<void>;
    reschedule: (documentId: string, executeAt: Date) => Promise<void>;
};
export declare const showsLocale: (row: QueueRow, defaultLocale: string | null) => boolean;
export declare function whenFromNow(iso: string): string;
export declare const dayKey: (date: Date) => string;
export declare function dayHeading(iso: string): string;
export declare function groupByDay(rows: QueueRow[]): {
    heading: string;
    key: string;
    rows: QueueRow[];
}[];
export declare const entryUrl: (row: QueueRow) => string;
