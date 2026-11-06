import { useReducer, useEffect, useContext } from "react";

import SourceTreeContext from "./SourceTreeContext";
import SourceTreeReducer, {
  DEFAULT_CONFIRM_LABEL,
} from "./SourceTreeReducer";

import CuratorContext from "../Curator/curatorContext";
import { getList } from "../../Utils/Scraper";

import {
  SET_TREE,
  SHOW_TREE_SELECTOR,
  HIDE_TREE_SELECTOR,
  SET_FILETREE_CHECKED,
  SET_MULTIPLE,
  SET_SAVE_BUTTON_ACTION,
  SET_CHILDREN,
  SET_TITLE,
  SET_CONFIRM_LABEL,
} from "../types";

const SourceTreeState = (props) => {
  const initialState = {
    open: false,
    tree: [],
    checked: [],
    title: "Please select the source directory on the server",
    multiple: false,
    save: null,
    confirmLabel: DEFAULT_CONFIRM_LABEL,
  };

  const [state, dispatch] = useReducer(SourceTreeReducer, initialState);

  const { fileServerPath } = useContext(CuratorContext);

  useEffect(() => {
    if (fileServerPath != "")
      getList(
        fileServerPath,
        fileServerPath.includes("zenodo") ? "zenodo" : "http",
        false,
        !fileServerPath ? null : fileServerPath
      ).then((res) => setTree(res.files));
  }, [fileServerPath]);

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

  const setChildren = (parent, children) => {
    dispatch({
      type: SET_CHILDREN,
      payload: { parent: parent, children: children },
    });
  };

  const setTitle = (title) => dispatch({ type: SET_TITLE, payload: title });

  // Wording of the selector's confirmation button. Call it AFTER
  // setSaveMethod, which resets it to the default.
  const setConfirmLabel = (label) =>
    dispatch({ type: SET_CONFIRM_LABEL, payload: label });

  return (
    <SourceTreeContext.Provider
      value={{
        selectorOpen: state.open,
        tree: state.tree,
        showSelector: state.open,
        checked: state.checked,
        title: state.title,
        multiple: state.multiple,
        save: state.save,
        confirmLabel: state.confirmLabel,
        setConfirmLabel,
        setTree,
        openSelector,
        closeSelector,
        setChecked,
        setMultiple,
        setSaveMethod,
        setChildren,
        setTitle,
      }}
    >
      {props.children}
    </SourceTreeContext.Provider>
  );
};

export default SourceTreeState;
