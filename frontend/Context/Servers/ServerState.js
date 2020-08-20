import React, { useReducer, useEffect } from "react";
import ServerContext from "./serverContext";
import serverReducer from "./serverReducer";

import servers from "./qresp_servers";

import { SET_SELECTED } from "../types";

const ServerState = (props) => {
  const initialState = {
    servers: servers,
    selected: [],
  };

  const [state, dispatch] = useReducer(serverReducer, initialState);

  const setSelected = (selected) => {
    dispatch({ type: SET_SELECTED, payload: selected });
  };

  return (
    <ServerContext.Provider
      value={{
        servers: state.servers,
        selected: state.selected,
        setSelected,
      }}
    >
      {props.children}
    </ServerContext.Provider>
  );
};

export default ServerState;
