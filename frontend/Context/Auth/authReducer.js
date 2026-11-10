import { AUTH_LOADING, SET_AUTH, AUTH_ERROR } from "../types";

export default (state, action) => {
  switch (action.type) {
    case AUTH_LOADING:
      return { ...state, loading: true, error: null };
    case SET_AUTH:
      return {
        ...state,
        loading: false,
        error: null,
        authenticated: action.payload.authenticated,
        user: action.payload.user,
      };
    case AUTH_ERROR:
      return { ...state, loading: false, error: action.payload };
    default:
      return state;
  }
};
