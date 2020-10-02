import React, { useReducer } from "react";
import CuratorHelperContext from "./curatorHelperContext";
import curatorHelperReducer from "./curatorHelperReducer";

import { OPEN_FORM, CLOSE_FORM, SET_DEF } from "../types";

const CuratorHelperState = (props) => {
  const initialState = {
    open: { chart: false, tool: false, dataset: false, script: false },
    def: { chart: null, tool: null, dataset: null, script: null },
  };

  const [state, dispatch] = useReducer(curatorHelperReducer, initialState);

  const openForm = (type) => dispatch({ type: OPEN_FORM, payload: type });
  const closeForm = (type) => dispatch({ type: CLOSE_FORM, payload: type });
  const setDefault = (type, def) =>
    dispatch({ type: SET_DEF, payload: { type: type, value: def } });

  return (
    <CuratorHelperContext.Provider
      value={{
        chartsHelper: { open: state.open.chart, def: state.def.chart },
        toolsHelper: { open: state.open.tool, def: state.def.tool },
        datasetsHelper: { open: state.open.dataset, def: state.def.dataset },
        scriptsHelper: { open: state.open.script, def: state.def.script },
        openForm,
        closeForm,
        setDefault,
      }}
    >
      {props.children}
    </CuratorHelperContext.Provider>
  );
};

export default CuratorHelperState;
