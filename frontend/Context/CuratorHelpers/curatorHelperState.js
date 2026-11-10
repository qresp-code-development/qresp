import React, { useReducer } from "react";
import CuratorHelperContext from "./curatorHelperContext";
import SpotlightState from "../Spotlight/SpotlightState";
import curatorHelperReducer from "./curatorHelperReducer";

import {
  OPEN_FORM,
  CLOSE_FORM,
  SET_DEF,
  SET_WORKFLOW_CLICK,
  SET_WORKFLOW_FIT,
  SET_WORKFLOW_OPEN,
  SET_WORKFLOW_SHOWLABELS,
  SET_EDITING,
} from "../types";

const CuratorHelperState = (props) => {
  const initialState = {
    open: {
      chart: false,
      tool: false,
      dataset: false,
      script: false,
    },
    // `head` is external data. It has no section form of its own -- the
    // workflow section's dialog is where it is written -- but it uses the
    // SAME def slot as every other artifact, so "open this record for
    // editing" works the one way everywhere.
    def: { chart: null, tool: null, dataset: null, script: null, head: null },
    // What a NEW record is for: a row-scoped link, an explicit independent
    // create, or null when the form was opened to edit. See
    // Utils/connectionIntent.js.
    link: { chart: null, tool: null, dataset: null, script: null, head: null },
    // To manage workflows
    workflow: { open: false, fit: false, showLabels: false, onClick: true },
    editing: {
      curatorInfo: false,
      fileServerPathInfo: false,
      paperInfo: false,
      referenceInfo: false,
      documentationInfo: false,
      licenseInfo: false,
      workflowInfo: false,
    },
  };

  const [state, dispatch] = useReducer(curatorHelperReducer, initialState);

  const openForm = (type, intent) =>
    dispatch({
      type: OPEN_FORM,
      payload: intent === undefined ? type : { type, intent },
    });
  const closeForm = (type) => dispatch({ type: CLOSE_FORM, payload: type });
  const setDefault = (type, def) =>
    dispatch({ type: SET_DEF, payload: { type: type, value: def } });

  const setExternalNodeFormOpen = (value, intent) =>
    dispatch({
      type: SET_WORKFLOW_OPEN,
      payload: intent === undefined ? value : { open: value, intent },
    });
  const setShowLabels = (value) =>
    dispatch({ type: SET_WORKFLOW_SHOWLABELS, payload: value });
  const setWorkflowFit = (value) =>
    dispatch({ type: SET_WORKFLOW_FIT, payload: value });
  const setWorkflowOnClick = (value) =>
    dispatch({ type: SET_WORKFLOW_CLICK, payload: value });

  const setEditing = (type, value) =>
    dispatch({ type: SET_EDITING, payload: { type, value } });

  return (
    <CuratorHelperContext.Provider
      value={{
        chartsHelper: {
          open: state.open.chart, def: state.def.chart, link: state.link.chart,
        },
        toolsHelper: {
          open: state.open.tool, def: state.def.tool, link: state.link.tool,
        },
        datasetsHelper: {
          open: state.open.dataset,
          def: state.def.dataset,
          link: state.link.dataset,
        },
        scriptsHelper: {
          open: state.open.script,
          def: state.def.script,
          link: state.link.script,
        },
        workflowHelper: state.workflow,
        externalHelper: {
          open: state.workflow.open, def: state.def.head, link: state.link.head,
        },
        editing: state.editing,
        openForm,
        closeForm,
        setDefault,
        setExternalNodeFormOpen,
        setShowLabels,
        setWorkflowFit,
        setWorkflowOnClick,
        setEditing,
      }}
    >
      {/* Which artifact is being pointed at lives one level in, so a
          pointer move does not re-render every section that reads a
          curator helper. */}
      <SpotlightState>{props.children}</SpotlightState>
    </CuratorHelperContext.Provider>
  );
};

export default CuratorHelperState;
