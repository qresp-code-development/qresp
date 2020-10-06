import { useReducer, useEffect } from "react";
import CuratorReducer from "./curatorReducer";
import CuratorContext from "./curatorContext";

import WebStore from "../../Utils/Persist";

import {
  SET_ALL,
  SET_CURATORINFO,
  SET_FILESERVERPATH,
  SET_PAPERINFO,
  SET_REFERENCE_AUTHORS,
  SET_REFERENCEINFO,
  SET,
  ADD,
  EDIT,
  DELETE,
  ADD_EDGE,
  DELETE_EDGE,
  SET_NODES,
  SET_EDGES,
} from "../types";

const CuratorState = (props) => {
  const initialState = {
    curatorInfo: {
      firstName: "",
      middleName: "",
      lastName: "",
      emailId: "",
      affaliation: "",
    },
    fileServerPath: "",
    paperInfo: {
      PIs: [{ firstName: "", middleName: "", lastName: "" }],
      collections: "",
      tags: "",
      notebookFile: "",
    },
    referenceInfo: {
      kind: "",
      doi: "",
      authors: "",
      title: "",
      publication: "",
      year: null,
      url: "",
      abstract: "",
    },
    charts: [],
    tools: [],
    datasets: [],
    scripts: [],
    heads: [],
    workflow: { nodes: [], edges: [] },
  };

  const [state, dispatch] = useReducer(CuratorReducer, initialState);

  useEffect(() => {
    const data = WebStore.get("state");
    if (data !== null) {
      setAll(data);
    }
  }, []);

  useEffect(() => {
    WebStore.set("state", state);
  }, [state]);

  useEffect(() => {
    setNodes([
      ...state.charts.map((el) => el.id),
      ...state.scripts.map((el) => el.id),
      ...state.datasets.map((el) => el.id),
      ...state.tools.map((el) => el.id),
      ...state.heads.map((el) => el.id),
    ]);
  }, [state.charts, state.scripts, state.datasets, state.tools, state.heads]);

  const setAll = (data) => dispatch({ type: SET_ALL, payload: data });

  const setCuratorInfo = (info) =>
    dispatch({ type: SET_CURATORINFO, payload: info });

  const setFileServerPath = (path) =>
    dispatch({ type: SET_FILESERVERPATH, payload: path });

  const setPaperInfo = (data) =>
    dispatch({ type: SET_PAPERINFO, payload: data });

  const setReferenceAuthors = (authors) =>
    dispatch({ type: SET_REFERENCE_AUTHORS, payload: authors });

  const setReferenceInfo = (data) =>
    dispatch({ type: SET_REFERENCEINFO, payload: data });

  const set = (charts) => dispatch({ type: SET, payload: charts });

  const add = (type, value) =>
    dispatch({ type: ADD, payload: { type: type + "s", value } });

  const edit = (type, value) =>
    dispatch({ type: EDIT, payload: { type: type + "s", value } });

  const del = (type, id) =>
    dispatch({ type: DELETE, payload: { type: type + "s", id } });

  const setNodes = (nodes) => dispatch({ type: SET_NODES, payload: nodes });
  const setEdges = (edges) => dispatch({ type: SET_EDGES, payload: edges });
  const addEdge = (edge) => dispatch({ type: ADD_EDGE, payload: edge });
  const deleteEdge = (edge) => dispatch({ type: DELETE_EDGE, payload: edge });

  return (
    <CuratorContext.Provider
      value={{
        reference: state.reference,
        curatorInfo: state.curatorInfo,
        fileServerPath: state.fileServerPath,
        paperInfo: state.paperInfo,
        referenceInfo: state.referenceInfo,
        charts: state.charts,
        tools: state.tools,
        datasets: state.datasets,
        scripts: state.scripts,
        workflow: state.workflow,
        heads: state.heads,
        metadata: state,
        setCuratorInfo,
        setFileServerPath,
        setPaperInfo,
        setReferenceAuthors,
        setReferenceInfo,
        set,
        add,
        edit,
        del,
        setNodes,
        setEdges,
        addEdge,
        deleteEdge,
      }}
    >
      {props.children}
    </CuratorContext.Provider>
  );
};

export default CuratorState;
