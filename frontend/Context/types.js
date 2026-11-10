// Server Actions
export const GET_SERVERS = "GET_SERVERS";
export const ERROR_SERVERS = "ERROR_SERVERS";

// Auth Actions
export const AUTH_LOADING = "AUTH_LOADING";
export const SET_AUTH = "SET_AUTH";
export const AUTH_ERROR = "AUTH_ERROR";

// Alert Actions
export const SET_ALERT = "SET_ALERT";
export const UNSET_ALERT = "UNSET_ALERT";

// Loader Animations
export const SHOW_LOADER = "SHOW_LOADER";
export const HIDE_LOADER = "HIDE_LOADER";

// Server Actions
export const SET_SERVER_STATE = "SET_SERVER_STATE";
export const SET_SELECTED = "SET_SELECTED";
export const SET_SELECTED_HTTP = "SET_SELECTED_HTTP";

// Source Tree
export const SET_TREE = "SET_TREE";
export const SHOW_TREE_SELECTOR = "SHOW_TREE_SELECTOR";
export const HIDE_TREE_SELECTOR = "HIDE_TREE_SELECTOR";
export const SET_FILETREE_CHECKED = "SET_CHECKED";
export const SET_MULTIPLE = "SET_MULTIPLE";
export const SET_SAVE_BUTTON_ACTION = "SAVE_BUTTON_ACTION";
export const SET_CHILDREN = "SET_CHILDREN";
export const SET_TITLE = "SET_TITLE";

// Curator Actions
export const SET_CURATOR_STATE = "SET_CURATOR_STATE";
export const SET_CURATORINFO = "SET_CURATORINFO";
export const SET_FILESERVERPATH = "SET_FILESERVERPATH";
export const SET_PAPERINFO = "SET_PAPERINFO";
export const SET_REFERENCE_AUTHORS = "SET_REFERENCE_AUTHORS";
export const SET_REFERENCEINFO = "SET_REFERENCEINFO";
export const SET_DOCUMENTATION = "SET_DOCUMENTATION";
export const SET_LICENSE = "SET_LICENSE";
export const SET_WORK_TYPE = "SET_WORK_TYPE";
export const SET_CODE_HOST = "SET_CODE_HOST";

// Curator Multi Type Actions
export const SET = "SET";
export const SET_CONFIRM_LABEL = "SET_CONFIRM_LABEL";
export const ADD = "ADD";
export const ADD_MANY = "ADD_MANY";
export const ADD_AND_LINK = "ADD_AND_LINK";
export const IMPORT_BUNDLE = "IMPORT_BUNDLE";
export const EDIT = "EDIT";
export const DELETE = "DELETE";

// Curator Workflow Actions
export const SET_NODES = "SET_NODES";
export const SET_EDGES = "SET_EDGES";
export const ADD_NODE = "ADD_NODE";
export const ADD_EDGE = "ADD_EDGE";
export const DELETE_NODE = "DELETE_NODE";
export const DELETE_EDGE = "DELETE_EDGE";
// Remove ONE connection, named by its endpoints.
//
// DELETE_EDGE removes by the vis-network edge id the manual drawing surface
// works in. The board's Unlink needs the other question answered -- "remove
// the connection between these two" -- and must touch nothing else: not the
// artifacts, not their other connections.
export const UNLINK = "UNLINK";

//Curator Helpers
export const OPEN_FORM = "OPEN_FORM";
export const CLOSE_FORM = "CLOSE_FORM";
export const SET_DEF = "SET_DEF";
export const SET_WORKFLOW_OPEN = "SET_WORKFLOW_OPEN";
export const SET_WORKFLOW_CLICK = "SET_WORKFLOW_CLICK";
export const SET_WORKFLOW_FIT = "SET_WORKFLOW_FIT";
export const SET_WORKFLOW_SHOWLABELS = "SET_WORKFLOW_SHOWLABELS";
export const SET_EDITING = "SET_EDITING";
