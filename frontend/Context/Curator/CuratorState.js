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
  SET_CHARTS,
  ADD_CHART,
  EDIT_CHART,
  DELETE_CHART,
  OPEN_CHART_FORM,
  CLOSE_CHART_FORM,
  SET_CHART_DEF,
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
    chartsHelper: { def: {}, open: false },
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

  const setCharts = (charts) => dispatch({ type: SET_CHARTS, payload: charts });

  const addChart = (chart) => dispatch({ type: ADD_CHART, payload: chart });

  const editChart = (chart) => dispatch({ type: EDIT_CHART, payload: chart });

  const deleteChart = (id) => dispatch({ type: DELETE_CHART, payload: id });

  const openChartForm = () => dispatch({ type: OPEN_CHART_FORM });
  const closeChartForm = () => dispatch({ type: CLOSE_CHART_FORM });
  const setChartDefault = (def) =>
    dispatch({ type: SET_CHART_DEF, payload: def });

  return (
    <CuratorContext.Provider
      value={{
        reference: state.reference,
        curatorInfo: state.curatorInfo,
        fileServerPath: state.fileServerPath,
        paperInfo: state.paperInfo,
        referenceInfo: state.referenceInfo,
        charts: state.charts,
        chartsHelper: state.chartsHelper,
        metadata: state,
        setCuratorInfo,
        setFileServerPath,
        setPaperInfo,
        setReferenceAuthors,
        setReferenceInfo,
        setCharts,
        addChart,
        editChart,
        deleteChart,
        openChartForm,
        closeChartForm,
        setChartDefault,
      }}
    >
      {props.children}
    </CuratorContext.Provider>
  );
};

export default CuratorState;
