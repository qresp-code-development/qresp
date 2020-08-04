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
    router.events.on("routeChangeStart", () => showLoader());
    router.events.on("routeChangeComplete", () => hideLoader());
    router.events.on("routeChangeError", () => hideLoader());

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleComplete);
      router.events.off("routeChangeError", handleComplete);
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
