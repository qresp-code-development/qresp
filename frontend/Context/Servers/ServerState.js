import React, { useReducer, useEffect } from "react";
import ServerContext from "./serverContext";
import serverReducer from "./serverReducer";

import servers from "../../data/qresp_servers";
import httpServers from "../../data/http_servers";

import { SET_SELECTED, SET_SELECTED_HTTP, SET_SERVER_STATE } from "../types";

import WebStore from "../../Utils/Persist";

const ServerState = (props) => {
  const initialState = {
    servers: servers,
    selected: null,
    httpServers: httpServers,
    selectedHttp: null,
  };

  const [state, dispatch] = useReducer(serverReducer, initialState);

  useEffect(() => {
    const data = WebStore.get("srvr");
    if (data !== null) {
      setServerState(data);
    }
  }, []);

  useEffect(() => {
    WebStore.set("srvr", state);
  }, [state]);

  const setServerState = (state) =>
    dispatch({ type: SET_SERVER_STATE, payload: state });

  const setSelected = (selected) => {
    dispatch({ type: SET_SELECTED, payload: selected });
  };

  const setSelectedHttp = (selected) => {
    dispatch({ type: SET_SELECTED_HTTP, payload: selected });
  };

  return (
    <ServerContext.Provider
      value={{
        servers: state.servers,
        selected: state.selected,
        httpServers: state.httpServers,
        selectedHttp: state.selectedHttp,
        setSelected,
        setSelectedHttp,
      }}
    >
      {props.children}
    </ServerContext.Provider>
  );
};

export default ServerState;
