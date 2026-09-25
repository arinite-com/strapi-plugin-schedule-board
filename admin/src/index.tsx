import { Calendar } from '@strapi/icons';
import * as React from 'react';
import { BOARD_PERMISSIONS } from './permissions';

// Registers the one thing publisher never had: a way to see everything it is holding.
// `addMenuLink` appears zero times in publisher's own bundle, so scheduling was per entry only and
// nothing anywhere answered "what goes out this week".
export default {
  register(app: {
    addMenuLink: (link: {
      to: string;
      icon: React.ElementType;
      intlLabel: { id: string; defaultMessage: string };
      permissions: unknown[];
      // The runtime wants a function returning a promise of a module with a default export, and
      // says so loudly if given React.lazy, whatever the published type suggests.
      Component: () => Promise<{ default: React.ComponentType }>;
      position?: number;
    }) => void;
  }) {
    app.addMenuLink({
      to: '/plugins/schedule-board',
      icon: Calendar,
      intlLabel: { id: 'schedule-board.menu', defaultMessage: 'Schedule' },
      // The same permission the routes demand. Left empty, the link showed for everybody and the
      // page behind it then answered 403 for anybody who had not been granted it.
      permissions: BOARD_PERMISSIONS,
      Component: () => import('./ScheduleBoard'),
      position: 3,
    });
  },
  bootstrap() {},
};
