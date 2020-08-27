import React, { useReducer, useEffect } from "react";
import CuratorReducer from "./curatorReducer";
import CuratorContext from "./curatorContext";

const CuratorState = (props) => {
  const initialState = {
    referenceInfo: {
      authors: [{ firstName: "", middleName: "", lastName: "" }],
    },
  };

  const [state, dispatch] = useReducer(CuratorReducer, initialState);

  return (
    <CuratorContext.Provider
      value={{ reference: state.reference, metadata: state }}
    >
      {props.children}
    </CuratorContext.Provider>
  );
};

export default CuratorState;
