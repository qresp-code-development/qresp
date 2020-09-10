import { SET_SELECTED, SET_SELECTED_HTTP } from "../types";

export default (state, action) => {
  switch (action.type) {
    case SET_SELECTED:
      return { ...state, selected: action.payload };
    case SET_SELECTED_HTTP:
      return { ...state, selectedHttp: action.payload };
    default:
      return state;
  }
};
