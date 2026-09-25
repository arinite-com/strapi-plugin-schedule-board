// The one permission this plugin has, named once. Three places have to agree about it: the menu
// link that shows or hides, the page that guards itself against being reached by its URL, and the
// server routes that actually enforce it. They drifted apart the first time and the board showed a
// link that led to a 403.
export const BOARD_PERMISSIONS = [{ action: 'plugin::schedule-board.read', subject: null }];
