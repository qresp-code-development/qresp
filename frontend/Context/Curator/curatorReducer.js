import {
  SET_CURATORINFO,
  SET_ALL,
  SET_FILESERVERPATH,
  SET_PAPERINFO,
  SET_REFERENCE_AUTHORS,
  SET_REFERENCEINFO,
  SET_CHARTS,
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
    case SET_REFERENCE_AUTHORS:
      return {
        ...state,
        referenceInfo: { ...state.referenceInfo, authors: action.payload },
      };
    case SET_REFERENCEINFO:
      return { ...state, referenceInfo: action.payload };
    case SET_CHARTS:
      return { ...state, charts: [...action.payload] };
    default:
      return state;
  }
};
