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
    // Opening a form and saying what the new record is FOR happen in one
    // dispatch, so a form can never be open with a stale or missing intent
    // left over from the last one. A bare string still opens a form with no
    // intent, which is how editing an existing record arrives.
    case OPEN_FORM: {
      const { type, intent } =
        typeof action.payload === "string"
          ? { type: action.payload, intent: null }
          : action.payload;
      return {
        ...state,
        open: { ...state.open, [type]: true },
        link: { ...state.link, [type]: intent || null },
      };
    }
    case CLOSE_FORM:
      return {
        ...state,
        open: { ...state.open, [action.payload]: false },
        link: { ...state.link, [action.payload]: null },
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
    // External data opens through the workflow's own dialog. Same rule: the
    // intent arrives with the open, and leaves with the close.
    case SET_WORKFLOW_OPEN: {
      const { open, intent } =
        typeof action.payload === "object" && action.payload !== null
          ? action.payload
          : { open: action.payload, intent: null };
      return {
        ...state,
        workflow: { ...state.workflow, open },
        link: { ...state.link, head: open ? intent || null : null },
      };
    }
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
