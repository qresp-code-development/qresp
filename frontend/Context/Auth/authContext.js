import { createContext } from "react";

// Signed-out default, so a component rendered outside <AuthState> (a test,
// or a page that mounts before the provider) reads "not signed in" instead
// of crashing on an undefined context.
const AuthContext = createContext({
  loading: false,
  authenticated: false,
  user: null,
});

export default AuthContext;
