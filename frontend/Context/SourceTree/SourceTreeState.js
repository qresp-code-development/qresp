import { useReducer } from "react";

import SourceTreeContext from "./SourceTreeContext";
import SourceTreeReducer from "./SourceTreeReducer";

import {
  SET_TREE,
  SHOW_TREE_SELECTOR,
  HIDE_TREE_SELECTOR,
  SET_FILETREE_SELECTED,
  SET_FILETREE_SELECTED_MULTIPLE,
} from "../types";

const SourceTreeState = (props) => {
  const initialState = {
    open: false,
    tree: [
      { label: "test1", value: "test1" },
      { label: "test2", value: "test2" },
      { label: "test11", value: "test11" },
      { label: "test12", value: "test12" },
      { label: "test111", value: "test111" },
    ],
    selected: "",
    selectedMultiple: [],
    multiple: false,
    title: "Select the server",
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

  const setSelected = (value) => {
    dispatch({ type: SET_FILETREE_SELECTED, payload: value });
  };

  const setSelectedMultiple = (value) => {
    dispatch({ type: SET_FILETREE_SELECTED_MULTIPLE, payload: value });
  };

  return (
    <SourceTreeContext.Provider
      value={{
        tree: state.tree,
        showSelector: state.open,
        selected: state.selected,
        selectedMultiple: state.selectedMultiple,
        title: state.title,
        setTree,
        openSelector,
        closeSelector,
        setSelected,
        setSelectedMultiple,
      }}
    >
      {props.children}
    </SourceTreeContext.Provider>
  );
};

export default SourceTreeState;
