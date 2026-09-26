"use strict";
const icons = require("@strapi/icons");
const BOARD_PERMISSIONS = [{ action: "plugin::schedule-board.read", subject: null }];
const index = {
  register(app) {
    app.addMenuLink({
      to: "/plugins/schedule-board",
      icon: icons.Calendar,
      intlLabel: { id: "schedule-board.menu", defaultMessage: "Schedule" },
      // The same permission the routes demand. Left empty, the link showed for everybody and the
      // page behind it then answered 403 for anybody who had not been granted it.
      permissions: BOARD_PERMISSIONS,
      Component: () => Promise.resolve().then(() => require("./ScheduleBoard-Bm8aUstH.js")),
      position: 3
    });
  },
  bootstrap() {
  }
};
exports.BOARD_PERMISSIONS = BOARD_PERMISSIONS;
exports.index = index;
