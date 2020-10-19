import {
  OPEN_FORM,
  CLOSE_FORM,
  SET_DEF,
  SET_WORKFLOW_CLICK,
  SET_WORKFLOW_FIT,
  SET_WORKFLOW_OPEN,
  SET_WORKFLOW_SHOWLABELS,
  SET_EDITING,
} from "../types";

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
    case SET_WORKFLOW_CLICK:
      return {
        ...state,
        workflow: { ...state.workflow, onClick: action.payload },
      };
    case SET_WORKFLOW_OPEN:
      return {
        ...state,
        workflow: { ...state.workflow, open: action.payload },
      };
    case SET_WORKFLOW_FIT:
      return {
        ...state,
        workflow: { ...state.workflow, fit: action.payload },
      };
    case SET_WORKFLOW_SHOWLABELS:
      return {
        ...state,
        workflow: { ...state.workflow, showLabels: action.payload },
      };
    case SET_EDITING:
      return {
        ...state,
        editing: {
          ...state.editing,
          [action.payload.type]: action.payload.value,
        },
      };
    default:
      return state;
  }
};
