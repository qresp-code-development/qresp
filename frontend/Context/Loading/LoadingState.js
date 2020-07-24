import React, { useReducer } from "react";
import LoadingContext from "./loadingContext";
import loadingReducer from "./loadingReducer";

import { SHOW_LOADER, HIDE_LOADER } from "../types";

const LoadingState = (props) => {
  const initialState = {
    loader: false,
  };

  const [state, dispatch] = useReducer(loadingReducer, initialState);

  const showLoader = () => {
    dispatch({ type: SHOW_LOADER });
  };
  const hideLoader = () => {
    dispatch({ type: HIDE_LOADER });
  };

  return (
    <LoadingContext.Provider
      value={{
        loading: state.loader,
        showLoader,
        hideLoader,
      }}
    >
      {props.children}
    </LoadingContext.Provider>
  );
};

export default LoadingState;
