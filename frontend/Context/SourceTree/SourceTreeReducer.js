import {
  SET_TREE,
  SHOW_TREE_SELECTOR,
  HIDE_TREE_SELECTOR,
  SET_FILETREE_CHECKED,
  TOGGLE_MULTIPLE,
} from "../types";

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
    case TOGGLE_MULTIPLE:
      return { ...state, multiple: !state.multiple };
    default:
      return state;
  }
};
