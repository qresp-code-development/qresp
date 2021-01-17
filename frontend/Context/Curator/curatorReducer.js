import {
  SET_CURATOR_STATE,
  SET_CURATORINFO,
  SET_FILESERVERPATH,
  SET_PAPERINFO,
  SET_REFERENCE_AUTHORS,
  SET_REFERENCEINFO,
  SET_LICENSE,
  SET,
  ADD,
  EDIT,
  DELETE,
  ADD_EDGE,
  DELETE_EDGE,
  SET_NODES,
  SET_EDGES,
  SET_DOCUMENTATION,
} from "../types";

import { getNodeNumber, reduceEdgeNodeId } from "../../Utils/graph";

export default (state, action) => {
  switch (action.type) {
    case SET_CURATORINFO:
      return {
        ...state,
        curatorInfo: action.payload,
      };
    case SET_CURATOR_STATE:
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
    case SET_DOCUMENTATION:
      return { ...state, documentation: action.payload };
    case SET_LICENSE:
      return { ...state, license: action.payload };
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
      const node_number_to_delete = getNodeNumber(action.payload.id);

      /*
      1st filter removes the edges corresponding to the deleted node.
      2nd filter fixes the node and id mapping, deleting a node causes the node with higher id having incorrect edges
      */
     
      const newEdges = state.workflow.edges
        .filter(
          (edge) =>
            edge.to != action.payload.id && edge.from != action.payload.id
        )
        .map((edge) => reduceEdgeNodeId(node_number_to_delete, prefix, edge));

      return {
        ...state,
        [action.payload.type]: state[action.payload.type]
          .filter((el) => el.id != action.payload.id)
          .map((el, i) => ({
            ...el,
            id: `${prefix}${i}`,
          })),
        workflow: { ...state.workflow, edges: newEdges },
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
    case ADD_EDGE:
      return {
        ...state,
        workflow: {
          ...state.workflow,
          edges: [...state.workflow.edges, action.payload],
        },
      };
    case DELETE_EDGE:
      return {
        ...state,
        workflow: {
          ...state.workflow,
          edges: state.workflow.edges.filter(
            (edge) => edge.id != action.payload
          ),
        },
      };
    default:
      return state;
  }
};
