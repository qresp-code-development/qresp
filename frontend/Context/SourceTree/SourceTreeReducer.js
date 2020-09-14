import {
  SET_TREE,
  SHOW_TREE_SELECTOR,
  HIDE_TREE_SELECTOR,
  SET_FILETREE_SELECTED,
  SET_FILETREE_SELECTED_MULTIPLE,
} from "../types";

export default (state, action) => {
  switch (action.type) {
    case SET_TREE:
      return { ...state, tree: action.payload };
    case SHOW_TREE_SELECTOR:
      return { ...state, open: true };
    case HIDE_TREE_SELECTOR:
      return { ...state, open: false };
    case SET_FILETREE_SELECTED_MULTIPLE:
      return { ...state, selectedMultiple: action.payload };
    case SET_FILETREE_SELECTED:
      return { ...state, selected: action.payload };
    default:
      return state;
  }
};
