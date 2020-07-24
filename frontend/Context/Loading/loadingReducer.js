import { SHOW_LOADER, HIDE_LOADER } from "../types";

export default (state, action) => {
  switch (action.type) {
    case SHOW_LOADER:
      return { loader: true };
    case HIDE_LOADER:
      return { loader: false };
    default:
      return state;
  }
};
