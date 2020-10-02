import React, { useReducer, useEffect } from "react";
import CuratorHelperContext from "./curatorHelperContext";
import curatorHelperReducer from "./curatorHelperReducer";

import { OPEN_CHART_FORM, CLOSE_CHART_FORM, SET_CHART_DEF } from "../types";

const CuratorHelperState = (props) => {
  const initialState = {
    chartsHelper: { def: null, open: false },
  };

  const [state, dispatch] = useReducer(curatorHelperReducer, initialState);

  const openChartForm = () => dispatch({ type: OPEN_CHART_FORM });
  const closeChartForm = () => dispatch({ type: CLOSE_CHART_FORM });
  const setDefaultChart = (def) =>
    dispatch({ type: SET_CHART_DEF, payload: def });

  return (
    <CuratorHelperContext.Provider
      value={{
        chartsHelper: state.chartsHelper,
        openChartForm,
        closeChartForm,
        setDefaultChart,
      }}
    >
      {props.children}
    </CuratorHelperContext.Provider>
  );
};

export default CuratorHelperState;
