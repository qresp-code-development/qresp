import React, { useReducer, useEffect } from "react";
import axios from "axios";
import { useRouter } from "next/router";

import AuthContext from "./authContext";
import authReducer from "./authReducer";

import { AUTH_LOADING, SET_AUTH, AUTH_ERROR } from "../types";

// Session-cookie auth against the same-origin backend (Qresp 2.0, identity
// only). All calls use relative /api paths, so the browser attaches the
// Flask session cookie itself; nothing is stored in localStorage. dev-login
// is a development/staging facility (backend keeps it off unless
// QRESP_ENABLE_DEV_LOGIN is set); Google sign-in is the real provider.

// CSRF wiring: /api/auth/me issues a session-bound token which must be
// replayed in X-CSRF-Token on mutating requests. The interceptor attaches it
// ONLY to same-origin calls (relative paths or the page origin, which is what
// getServer() returns) — never to external hosts such as the DOI scraper.
// Self-healing: if no token is cached when a mutation fires (fresh load,
// failed initial /me, backend session replaced), it is fetched just in time;
// and a 403 CSRF rejection drops the cache so the next attempt re-fetches.
// The guards also keep jest's axios automock (no interceptors object) happy.
let csrfToken = null;

const fetchCsrfToken = async () => {
  const res = await axios.get("/api/auth/me");
  if (res.data && res.data.csrf_token) {
    csrfToken = res.data.csrf_token;
  }
  return res;
};

if (axios.interceptors && axios.interceptors.request) {
  axios.interceptors.request.use(async (config) => {
    const method = (config.method || "get").toLowerCase();
    const mutating = ["post", "put", "patch", "delete"].includes(method);
    const url = config.url || "";
    const sameOrigin =
      url.startsWith("/") ||
      (typeof window !== "undefined" &&
        url.startsWith(window.location.origin));
    if (mutating && sameOrigin) {
      if (!csrfToken) {
        // Just-in-time fetch; /api/auth/me is a GET, so this cannot recurse.
        try {
          await fetchCsrfToken();
        } catch (err) {
          console.error("Could not obtain a CSRF token:", err);
        }
      }
      if (csrfToken) {
        config.headers = config.headers || {};
        config.headers["X-CSRF-Token"] = csrfToken;
      }
    }
    return config;
  });
}

if (axios.interceptors && axios.interceptors.response) {
  axios.interceptors.response.use(undefined, (error) => {
    const res = error && error.response;
    if (
      res &&
      res.status === 403 &&
      res.data &&
      typeof res.data.error === "string" &&
      res.data.error.indexOf("CSRF") !== -1
    ) {
      // Stale token (e.g. the backend session store was replaced): drop the
      // cache so the user's retry fetches a fresh one.
      csrfToken = null;
    }
    return Promise.reject(error);
  });
}

const AuthState = (props) => {
  const router = useRouter();

  const initialState = {
    loading: true,
    authenticated: false,
    user: null,
    error: null,
  };

  const [state, dispatch] = useReducer(authReducer, initialState);

  const refresh = async () => {
    dispatch({ type: AUTH_LOADING });
    try {
      const res = await fetchCsrfToken();
      dispatch({ type: SET_AUTH, payload: res.data });
    } catch (err) {
      console.error(err);
      dispatch({
        type: SET_AUTH,
        payload: { authenticated: false, user: null },
      });
    }
  };

  // Email/password accounts are inactive until the emailed link is opened
  // (pages/verify-email.js), so neither sign-up nor signing in to an
  // unconfirmed account creates a session; both report
  // `verificationRequired` instead. `verifyLink` is only present on staging
  // (QRESP_PUBLISH_SKIP_EMAIL), where no email is sent.
  const localLogin = async (email, password) => {
    try {
      const res = await axios.post("/api/auth/local-login", { email, password });
      dispatch({ type: SET_AUTH, payload: res.data });
      return { ok: true };
    } catch (err) {
      const data = (err.response && err.response.data) || {};
      const msg = data.error || "Sign-in failed. Please check your email and password.";
      if (data.verification_required) {
        return { ok: false, verificationRequired: true, error: msg, verifyLink: data.verify_link };
      }
      dispatch({ type: AUTH_ERROR, payload: msg });
      return { ok: false, error: msg };
    }
  };

  const register = async (email, password, name, affiliation) => {
    try {
      const res = await axios.post("/api/auth/register", { email, password, name, affiliation });
      if (res.data && res.data.verification_required) {
        return {
          ok: true,
          verificationRequired: true,
          email: res.data.email,
          verifyLink: res.data.verify_link,
        };
      }
      dispatch({ type: SET_AUTH, payload: res.data });
      return { ok: true };
    } catch (err) {
      const msg =
        (err.response && err.response.data && err.response.data.error) ||
        "Registration failed. Please try again.";
      dispatch({ type: AUTH_ERROR, payload: msg });
      return { ok: false, error: msg };
    }
  };

  const verifyEmail = async (token, password) => {
    try {
      const res = await axios.post("/api/auth/verify-email", { token, password });
      dispatch({ type: SET_AUTH, payload: res.data });
      return { ok: true };
    } catch (err) {
      const msg =
        (err.response && err.response.data && err.response.data.error) ||
        "Could not confirm your email. Please try again.";
      return { ok: false, error: msg };
    }
  };

  const devLogin = async (email, name, isAdmin) => {
    try {
      const res = await axios.post("/api/auth/dev-login", {
        email: email,
        name: name || undefined,
        is_admin: Boolean(isAdmin),
      });
      dispatch({ type: SET_AUTH, payload: res.data });
      return { ok: true };
    } catch (err) {
      const status = err.response && err.response.status;
      const message =
        status === 404
          ? "Development login is unavailable on this server."
          : "Login failed, please check the email and try again.";
      dispatch({ type: AUTH_ERROR, payload: message });
      return { ok: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await axios.post("/api/auth/logout");
    } catch (err) {
      console.error(err);
    }
    dispatch({
      type: SET_AUTH,
      payload: { authenticated: false, user: null },
    });
    if (router && router.asPath !== "/") {
      router.push("/");
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        loading: state.loading,
        authenticated: state.authenticated,
        user: state.user,
        error: state.error,
        refresh,
        localLogin,
        register,
        verifyEmail,
        devLogin,
        logout,
      }}
    >
      {props.children}
    </AuthContext.Provider>
  );
};

export default AuthState;
