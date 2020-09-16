import { useReducer, useEffect } from "react";
import CuratorReducer from "./curatorReducer";
import CuratorContext from "./curatorContext";

import { SET_CURATORINFO } from "../types";

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
  };

  const [state, dispatch] = useReducer(CuratorReducer, initialState);

  const setCuratorInfo = (info) => {
    dispatch({ type: SET_CURATORINFO, payload: info });
  };

  return (
    <CuratorContext.Provider
      value={{
        reference: state.reference,
        curatorInfo: state.curatorInfo,
        metadata: state,
        setCuratorInfo: setCuratorInfo,
      }}
    >
      {props.children}
    </CuratorContext.Provider>
  );
};

export default CuratorState;
