import React, { useReducer, useEffect } from "react";
import ServerContext from "./serverContext";
import serverReducer from "./serverReducer";

import servers from "./qresp_servers";
import httpServers from "./http_servers";

import { SET_SELECTED, SET_SELECTED_HTTP } from "../types";

const ServerState = (props) => {
  const initialState = {
    servers: servers,
    selected: null,
    httpServers: httpServers,
    selectedHttp: null,
  };

  const [state, dispatch] = useReducer(serverReducer, initialState);

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
