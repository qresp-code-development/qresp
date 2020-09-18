import { useReducer } from "react";

import SourceTreeContext from "./SourceTreeContext";
import SourceTreeReducer from "./SourceTreeReducer";

import {
  SET_TREE,
  SHOW_TREE_SELECTOR,
  HIDE_TREE_SELECTOR,
  SET_FILETREE_CHECKED,
  SET_MULTIPLE,
  SET_SAVE_BUTTON_ACTION,
} from "../types";

const SourceTreeState = (props) => {
  const initialState = {
    open: false,
    tree: [],
    checked: [],
    title: "Please select the source directory on the server",
    multiple: false,
    save: null,
  };

  const [state, dispatch] = useReducer(SourceTreeReducer, initialState);

  const setTree = (value) => {
    dispatch({ type: SET_TREE, payload: value });
  };

  const openSelector = () => {
    dispatch({ type: SHOW_TREE_SELECTOR });
  };

  const closeSelector = () => {
    dispatch({ type: HIDE_TREE_SELECTOR });
  };

  const setChecked = (value) => {
    dispatch({ type: SET_FILETREE_CHECKED, payload: value });
  };

  const setMultiple = (value) => {
    dispatch({ type: SET_MULTIPLE, payload: value });
  };

  const setSaveMethod = (value) => {
    dispatch({ type: SET_SAVE_BUTTON_ACTION, payload: value });
  };

  return (
    <SourceTreeContext.Provider
      value={{
        tree: state.tree,
        showSelector: state.open,
        checked: state.checked,
        title: state.title,
        multiple: state.multiple,
        save: state.save,
        setTree,
        openSelector,
        closeSelector,
        setChecked,
        setMultiple,
        setSaveMethod,
      }}
    >
      {props.children}
    </SourceTreeContext.Provider>
  );
};

export default SourceTreeState;
