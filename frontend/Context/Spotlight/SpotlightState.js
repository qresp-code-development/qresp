import React, { useCallback, useMemo, useState } from "react";
import SpotlightContext from "./spotlightContext";

/**
 * Holds the pointed-at artifact for everything below it.
 *
 * `children` is taken as a prop and passed straight through, so a pointer
 * move re-renders THIS component and the handful that read the context --
 * not the sections in between.
 */
const SpotlightState = ({ children }) => {
  const [spotlight, setSpotlightState] = useState("");
  const setSpotlight = useCallback((id) => setSpotlightState(id || ""), []);
  const value = useMemo(
    () => ({ spotlight, setSpotlight }),
    [spotlight, setSpotlight]
  );

  return (
    <SpotlightContext.Provider value={value}>
      {children}
    </SpotlightContext.Provider>
  );
};

export default SpotlightState;
