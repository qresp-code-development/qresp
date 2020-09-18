import { useReducer, useEffect } from "react";
import CuratorReducer from "./curatorReducer";
import CuratorContext from "./curatorContext";

import WebStore from "../../Utils/Persist";

import { SET_ALL, SET_CURATORINFO, SET_FILESERVERPATH } from "../types";

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

  const setAll = (data) => {
    dispatch({ type: SET_ALL, payload: data });
  };

  const setCuratorInfo = (info) => {
    dispatch({ type: SET_CURATORINFO, payload: info });
  };

  const setFileServerPath = (path) => {
    dispatch({ type: SET_FILESERVERPATH, payload: path });
  };

  return (
    <CuratorContext.Provider
      value={{
        reference: state.reference,
        curatorInfo: state.curatorInfo,
        fileServerPath: state.fileServerPath,
        metadata: state,
        setCuratorInfo: setCuratorInfo,
        setFileServerPath: setFileServerPath,
      }}
    >
      {props.children}
    </CuratorContext.Provider>
  );
};

export default CuratorState;
