import { OPEN_FORM, CLOSE_FORM, SET_DEF } from "../types";

export default (state, action) => {
  switch (action.type) {
    case OPEN_FORM:
      return { ...state, open: { ...state.open, [action.payload]: true } };
    case CLOSE_FORM:
      return {
        ...state,
        open: { ...state.open, [action.payload]: false },
      };
    case SET_DEF:
      return {
        ...state,
        def: { ...state.def, [action.payload.type]: action.payload.value },
      };
    default:
      return state;
  }
};
