import React, { useReducer } from "react";
import AlertContext from "./alertContext";
import alertReducer from "./alertReducer";

import { SET_ALERT, UNSET_ALERT } from "../types";

const AlertState = (props) => {
  const initialState = {
    open: false,
    title: "",
    msg: "",
    buttons: null,
    hideDismiss: false,
  };

  const [state, dispatch] = useReducer(alertReducer, initialState);

  // Set ALert

  const setAlert = (title = null, msg, buttons = null, options = {}) => {
    // hideDismiss: dialogs providing their own Cancel button suppress the
    // default Dismiss so the user never sees two ways to close.
    dispatch({
      type: SET_ALERT,
      payload: { title, msg, buttons, hideDismiss: !!options.hideDismiss },
    });
  };

  const unsetAlert = () => {
    dispatch({ type: UNSET_ALERT });
  };

  return (
    <AlertContext.Provider
      value={{
        open: state.open,
        title: state.title,
        msg: state.msg,
        buttons: state.buttons,
        hideDismiss: state.hideDismiss,
        setAlert,
        unsetAlert,
      }}
    >
      {props.children}
    </AlertContext.Provider>
  );
};

export default AlertState;
