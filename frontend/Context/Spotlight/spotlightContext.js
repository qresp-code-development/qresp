import { createContext } from "react";

// WHICH ARTIFACT IS BEING POINTED AT.
//
// The resource list and the workflow drawing are separate sections showing
// the same artifacts, and matching a row to a box used to mean reading an
// internal id printed on both. Pointing at either now lights up the other.
//
// It holds an artifact REFERENCE, never a name: two artifacts may well be
// called the same thing, and a name can be edited while the pointer rests
// on it. It is transient -- nothing is stored, nothing is saved.
//
// It is deliberately its OWN context rather than another key on
// CuratorHelperContext. A pointer move changes it many times a second, and
// every consumer of that context re-renders when its value changes: putting
// it there rebuilt the whole resource list under the cursor, which loses
// the element being clicked and any focus inside it.
const SpotlightContext = createContext({
  spotlight: "",
  setSpotlight: () => {},
});

export default SpotlightContext;
