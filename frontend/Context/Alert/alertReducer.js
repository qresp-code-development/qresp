import { SET_ALERT, UNSET_ALERT } from "../types";

export default (state, action) => {
  switch (action.type) {
    case SET_ALERT:
      return { ...action.payload, open: true };
    case UNSET_ALERT:
      return { ...state, open: false };
    default:
      return state;
  }
};
