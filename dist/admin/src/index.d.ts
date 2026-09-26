import * as React from 'react';
declare const _default: {
    register(app: {
        addMenuLink: (link: {
            to: string;
            icon: React.ElementType;
            intlLabel: {
                id: string;
                defaultMessage: string;
            };
            permissions: unknown[];
            Component: () => Promise<{
                default: React.ComponentType;
            }>;
            position?: number;
        }) => void;
    }): void;
    bootstrap(): void;
};
export default _default;
