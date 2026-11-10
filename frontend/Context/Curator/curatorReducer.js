import {
  SET_CURATOR_STATE,
  SET_CURATORINFO,
  SET_FILESERVERPATH,
  SET_PAPERINFO,
  SET_REFERENCE_AUTHORS,
  SET_REFERENCEINFO,
  SET_LICENSE,
  SET_WORK_TYPE,
  SET_CODE_HOST,
  SET,
  ADD,
  ADD_MANY,
  ADD_AND_LINK,
  IMPORT_BUNDLE,
  EDIT,
  DELETE,
  ADD_EDGE,
  DELETE_EDGE,
  UNLINK,
  SET_NODES,
  SET_EDGES,
  SET_DOCUMENTATION,
} from "../types";

import { getNodeNumber, reduceEdgeNodeId } from "../../Utils/graph";
import { closesLoop, edgeProblem } from "../../Utils/workflowGraph";
import { connectionEdge, isRowScoped } from "../../Utils/connectionIntent";

// Ids are minted against the list as it exists at dispatch time, so a batch
// can never collide with an existing record the way a caller-computed
// `${prefix}${list.length}` would once several items are added at once.
const mintIds = (existing, listType, values) => {
  const idPrefix = listType.charAt(0);
  const taken = new Set(existing.map((el) => el.id));
  let next = existing.length;
  return (values || []).map((value) => {
    while (taken.has(`${idPrefix}${next}`)) {
      next += 1;
    }
    const id = `${idPrefix}${next}`;
    taken.add(id);
    next += 1;
    return { ...value, id };
  });
};

const ARTIFACT_LISTS = ["charts", "scripts", "datasets", "tools", "heads"];

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
    case SET_WORK_TYPE:
      return { ...state, workType: action.payload };
    case SET_CODE_HOST:
      return { ...state, codeHost: action.payload };
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

    // Batch append (folder analysis "Add selected items").
    case ADD_MANY: {
      const existing = state[action.payload.type] || [];
      const added = mintIds(existing, action.payload.type, action.payload.values);
      return { ...state, [action.payload.type]: [...existing, ...added] };
    }

    // CREATE AND LINK, as one change.
    //
    // A resource started from a row's LINK action and the arrow joining it to
    // that row are one intention, so they land in one dispatch: the records
    // get their ids here, and each new id is joined to the source with the
    // relationship the curator chose. If ANY of those arrows is refused by
    // `edgeProblem` -- the check every other link goes through -- nothing is
    // written at all: no record without its arrow, no arrow without its
    // record.
    //
    // A record created a moment ago has exactly one edge, so it cannot close
    // a loop; a loop here would mean the state is not what the caller saw,
    // and that is refused too rather than written unconfirmed.
    case ADD_AND_LINK: {
      const { type, values, intent, choice } = action.payload;
      if (!isRowScoped(intent)) return state;
      const existing = state[type] || [];
      const added = mintIds(existing, type, values);
      if (!added.length) return state;
      const knownIds = ARTIFACT_LISTS.flatMap((list) =>
        (state[list] || []).map((el) => el.id)
      ).concat(added.map((el) => el.id));
      const edges = ((state.workflow || {}).edges || []).slice();
      for (const record of added) {
        const edge = connectionEdge(intent, record.id, choice);
        if (edgeProblem(edge, knownIds, edges) || closesLoop(edges, edge)) {
          return state;
        }
        edges.push(edge);
      }
      return {
        ...state,
        [type]: [...existing, ...added],
        workflow: { ...state.workflow, edges },
      };
    }

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

    // A whole folder import as ONE change: records of several kinds plus the
    // links between them. Callers name records with their own keys; ids are
    // minted here and the links translated. A link that fails the same checks
    // every other link goes through is skipped -- the records still land.
    case IMPORT_BUNDLE: {
      const { records = [], links = [] } = action.payload || {};
      const next = { ...state };
      const idByKey = {};
      ["charts", "datasets", "scripts", "tools"].forEach((list) => {
        const items = records.filter((record) => record.list === list);
        if (!items.length) return;
        const minted = mintIds(next[list] || [], list, items.map((i) => i.value));
        minted.forEach((record, index) => {
          idByKey[items[index].key] = record.id;
        });
        next[list] = [...(next[list] || []), ...minted];
      });
      const knownIds = ARTIFACT_LISTS.flatMap((list) =>
        (next[list] || []).map((el) => el.id)
      );
      const edges = ((next.workflow || {}).edges || []).slice();
      // A link end is a new record's key or an id already in the record.
      const knownSet = new Set(knownIds);
      const resolve = (key) => idByKey[key] || (knownSet.has(key) ? key : undefined);
      links.forEach((link) => {
        const edge = { from: resolve(link.from), to: resolve(link.to), type: link.type };
        if (!edge.from || !edge.to) return;
        if (edgeProblem(edge, knownIds, edges) || closesLoop(edges, edge)) return;
        edges.push(edge);
      });
      next.workflow = { ...(next.workflow || {}), edges };
      return next;
    }

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
    // Remove exactly ONE connection, named by its endpoints.
    //
    // Only that edge goes. The two artifacts stay, and so does every other
    // connection either of them has -- a script feeding two figures keeps
    // feeding the other one when it is unlinked from the first.
    case UNLINK: {
      const { from, to } = action.payload || {};
      return {
        ...state,
        workflow: {
          ...state.workflow,
          edges: state.workflow.edges.filter((edge) => {
            const source = Array.isArray(edge) ? edge[0] : edge.from;
            const target = Array.isArray(edge) ? edge[1] : edge.to;
            return !(source === from && target === to);
          }),
        },
      };
    }

    default:
      return state;
  }
};
