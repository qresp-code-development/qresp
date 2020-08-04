import React, { useReducer, useEffect } from "react";
import LoadingContext from "./loadingContext";
import loadingReducer from "./loadingReducer";

import { useRouter } from "next/router";

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

  const router = useRouter();

  useEffect(() => {
    router.events.on("routeChangeStart", showLoader);
    router.events.on("routeChangeComplete", hideLoader);
    router.events.on("routeChangeError", hideLoader);

    return () => {
      router.events.off("routeChangeStart", showLoader);
      router.events.off("routeChangeComplete", hideLoader);
      router.events.off("routeChangeError", hideLoader);
    };
  }, []);

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
