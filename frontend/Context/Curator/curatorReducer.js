import {
  SET_CURATORINFO,
  SET_ALL,
  SET_FILESERVERPATH,
  SET_PAPERINFO,
  SET_REFERENCE_AUTHORS,
  SET_REFERENCEINFO,
  SET,
  ADD,
  EDIT,
  DELETE,
  ADD_NODE,
  ADD_EDGE,
  DELETE_EDGE,
  DELETE_NODE,
  SET_NODES,
  SET_EDGES,
} from "../types";

export default (state, action) => {
  switch (action.type) {
    case SET_CURATORINFO:
      return {
        ...state,
        curatorInfo: action.payload,
      };
    case SET_ALL:
      return action.payload;
    case SET_FILESERVERPATH:
      return { ...state, fileServerPath: action.payload };
    case SET_PAPERINFO:
      return { ...state, paperInfo: action.payload };
    case SET_REFERENCE_AUTHORS:
      return {
        ...state,
        referenceInfo: { ...state.referenceInfo, authors: action.payload },
      };
    case SET_REFERENCEINFO:
      return { ...state, referenceInfo: action.payload };
    case SET:
      return { ...state, [action.payload.type]: [...action.payload.value] };
    case ADD:
      return {
        ...state,
        [action.payload.type]: [
          ...state[action.payload.type],
          action.payload.value,
        ],
      };
    case DELETE:
      const prefix = action.payload.type.charAt(0);

      return {
        ...state,
        [action.payload.type]: state[action.payload.type]
          .filter((el) => el.id != action.payload.id)
          .map((el, i) => ({ ...el, id: `${prefix}${i}` })),
      };
    case EDIT:
      return {
        ...state,
        [action.payload.type]: state[action.payload.type].map((el) =>
          el.id == action.payload.value.id ? action.payload.value : el
        ),
      };

    case SET_NODES:
      return {
        ...state,
        workflow: { ...state.workflow, nodes: [...action.payload] },
      };
    case SET_EDGES:
      return {
        ...state,
        workflow: { ...state.workflow, edges: [...action.payload] },
      };
    case ADD_NODE:
      return {
        ...state,
        workflow: {
          ...state.workflow,
          nodes: [...state.workflow.nodes, ...action.payload],
        },
      };
    case ADD_EDGE:
      return {
        ...state,
        workflow: {
          ...state.workflow,
          edges: [...state.workflow.edges, ...action.payload],
        },
      };
    case DELETE_NODE:
      return {
        ...state,
        workflow: {
          ...state.workflow,
          nodes: state.workflow.nodes.filter((node) => node != action.payload),
          // Deleting a node also deletes any edges associated to it
          edges: state.workflow.edges.filter(
            (edge) => edge[0] != action.payload && edge[1] != action.payload
          ),
        },
      };
    case DELETE_EDGE:
      return {
        ...state,
        workflow: {
          ...state.workflow,
          edges: state.workflow.edges.filter(
            (edge) =>
              edge[0] != action.payload[0] && edge[1] != action.payload[1]
          ),
        },
      };
    default:
      return state;
  }
};
