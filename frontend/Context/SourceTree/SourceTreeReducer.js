import { findAndSetChildren } from "../../Utils/Scraper";

import {
  SET_TREE,
  SHOW_TREE_SELECTOR,
  HIDE_TREE_SELECTOR,
  SET_FILETREE_CHECKED,
  SET_MULTIPLE,
  SET_SAVE_BUTTON_ACTION,
  SET_CHILDREN,
  SET_TITLE,
  SET_CONFIRM_LABEL,
} from "../types";

// Default label of the selector's confirmation button. Consumers that want
// different wording call setConfirmLabel AFTER setSaveMethod; setting a new
// save method resets it, so a consumer that does not opt in can never inherit
// another form's wording.
export const DEFAULT_CONFIRM_LABEL = "Save";

export default (state, action) => {
  switch (action.type) {
    case SET_TREE:
      return { ...state, tree: action.payload, checked: [] };
    case SHOW_TREE_SELECTOR:
      return { ...state, open: true };
    case HIDE_TREE_SELECTOR:
      return { ...state, open: false };
    case SET_FILETREE_CHECKED:
      return { ...state, checked: action.payload };
    case SET_MULTIPLE:
      return { ...state, multiple: action.payload };
    case SET_SAVE_BUTTON_ACTION:
      return {
        ...state,
        save: action.payload,
        confirmLabel: DEFAULT_CONFIRM_LABEL,
      };
    case SET_CONFIRM_LABEL:
      return {
        ...state,
        confirmLabel: action.payload || DEFAULT_CONFIRM_LABEL,
      };
    case SET_TITLE:
      return { ...state, title: action.payload };
    case SET_CHILDREN:
      const newTree = findAndSetChildren(
        JSON.parse(JSON.stringify(state.tree)),
        action.payload.parent,
        action.payload.children
      );
      return {
        ...state,
        tree: newTree,
      };
    default:
      return state;
  }
};
