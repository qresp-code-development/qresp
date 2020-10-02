import { OPEN_CHART_FORM, CLOSE_CHART_FORM, SET_CHART_DEF } from "../types";

export default (state, action) => {
  switch (action.type) {
    case OPEN_CHART_FORM:
      return { ...state, chartsHelper: { ...state.chartsHelper, open: true } };
    case CLOSE_CHART_FORM:
      return { ...state, chartsHelper: { ...state.chartsHelper, open: false } };
    case SET_CHART_DEF:
      return {
        ...state,
        chartsHelper: { ...state.chartsHelper, def: action.payload },
      };
    default:
      return state;
  }
};
