import { SET_SELECTED } from "../types";

export default (state, action) => {
  switch (action.type) {
    case SET_SELECTED:
      return { ...state, selected: action.payload };
    default:
      return state;
  }
};
