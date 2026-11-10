/**
 * A loaded draft whose publication details and workflow are complete must
 * not ask for them to be saved again before Publish.
 */
import { render } from "@testing-library/react";

jest.mock("../components/CuratorElements/ReferenceElement", () => ({
  __esModule: true,
  default: () => null,
  isCompleteReference: jest.requireActual("../components/CuratorElements/ReferenceElement")
    .isCompleteReference,
}));

import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import LoadedDraftSaver from "../components/CuratorElements/LoadedDraftSaver";
import { isCompleteReference } from "../components/CuratorElements/ReferenceElement";

const REFERENCE = {
  kind: "journal",
  title: "An NV- center in MgO",
  authors: "Vrindaa Somjit, Giulia Galli",
  publication: "npj Comput. Mater. 11, 75 (2025)",
  abstract: "Recent predictions...",
};
const WORKFLOW = {
  nodes: ["d0", "s0", "c0"],
  edges: [["d0", "s0"], { from: "s0", to: "c0", type: "generates" }],
};

const mount = ({ loadVersion = 1, referenceInfo = REFERENCE, workflow = WORKFLOW } = {}) => {
  const setEditing = jest.fn();
  const view = (version) => (
    <CuratorContext.Provider value={{ loadVersion: version, referenceInfo, workflow }}>
      <CuratorHelperContext.Provider value={{ setEditing }}>
        <LoadedDraftSaver />
      </CuratorHelperContext.Provider>
    </CuratorContext.Provider>
  );
  const result = render(view(loadVersion));
  return { setEditing, rerender: (v) => result.rerender(view(v)) };
};

beforeEach(() => window.sessionStorage.clear());

describe("after a draft is loaded", () => {
  it("counts complete publication details and a sound workflow as saved", () => {
    const { setEditing } = mount();
    expect(setEditing).toHaveBeenCalledWith("referenceInfo", false);
    expect(setEditing).toHaveBeenCalledWith("workflowInfo", false);
  });

  it("does nothing before any load", () => {
    const { setEditing } = mount({ loadVersion: 0 });
    expect(setEditing).not.toHaveBeenCalled();
  });

  it("leaves incomplete details and a disconnected workflow unsaved", () => {
    const { setEditing } = mount({
      referenceInfo: { ...REFERENCE, abstract: "" },
      workflow: { nodes: ["d0", "s0", "c0"], edges: [["d0", "s0"]] },
    });
    expect(setEditing).not.toHaveBeenCalled();
  });

  it("handles each load once, not on every re-render", () => {
    const { setEditing, rerender } = mount();
    setEditing.mockClear();
    rerender(1);
    expect(setEditing).not.toHaveBeenCalled();
    rerender(2);
    expect(setEditing).toHaveBeenCalledWith("referenceInfo", false);
  });

  it("knows what a complete reference is", () => {
    expect(isCompleteReference(REFERENCE)).toBe(true);
    expect(isCompleteReference({ ...REFERENCE, title: " " })).toBe(false);
  });
});
