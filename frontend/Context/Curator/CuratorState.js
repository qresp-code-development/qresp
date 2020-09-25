import { useReducer, useEffect } from "react";
import CuratorReducer from "./curatorReducer";
import CuratorContext from "./curatorContext";

import WebStore from "../../Utils/Persist";

import {
  SET_ALL,
  SET_CURATORINFO,
  SET_FILESERVERPATH,
  SET_PAPERINFO,
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
    referenceInfo: {
      authors: [{ firstName: "", middleName: "", lastName: "" }],
    },
    fileServerPath: "",
    paperInfo: {
      PIs: [{ firstName: "", middleName: "", lastName: "" }],
      collections: "",
      tags: "",
      notebookFile: "",
    },
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

  return (
    <CuratorContext.Provider
      value={{
        reference: state.reference,
        curatorInfo: state.curatorInfo,
        fileServerPath: state.fileServerPath,
        paperInfo: state.paperInfo,
        metadata: state,
        setCuratorInfo: setCuratorInfo,
        setFileServerPath: setFileServerPath,
        setPaperInfo: setPaperInfo,
      }}
    >
      {props.children}
    </CuratorContext.Provider>
  );
};

export default CuratorState;
