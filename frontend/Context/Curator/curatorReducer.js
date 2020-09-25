import {
  SET_CURATORINFO,
  SET_ALL,
  SET_FILESERVERPATH,
  SET_PAPERINFO,
} from "../types";

export default (state, action) => {
  switch (action.type) {
    case SET_CURATORINFO:
      return {
        ...state,
        curatorInfo: action.payload,
      };
    case SET_ALL:
      return action.payload;
    case SET_FILESERVERPATH:
      return { ...state, fileServerPath: action.payload };
    case SET_PAPERINFO:
      return { ...state, paperInfo: action.payload };
    default:
      return state;
  }
};
