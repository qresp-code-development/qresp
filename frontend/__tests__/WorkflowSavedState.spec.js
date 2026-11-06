/**
 * A saved workflow stays saved when the section mounts again -- coming back
 * from the record preview used to mark it unsaved, so Publish refused until
 * the curator pressed Save a second time.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
jest.mock("../components/Workflow/Graph", () => () => <div data-testid="stub-graph" />);
jest.mock("../components/Workflow/Legend", () => () => null);

import AlertContext from "../Context/Alert/alertContext";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import WorkflowInfoElement from "../components/CuratorElements/WorkflowElement";
import {
  WORKFLOW_SAVED_KEY,
  workflowSignature,
} from "../components/CuratorForms/WorkflowInfoForm";

const WORKFLOW = {
  nodes: ["s0", "c0"],
  edges: [{ from: "s0", to: "c0", type: "generates" }],
};

const mount = (workflow = WORKFLOW, editing = { workflowInfo: true }) => {
  const setEditing = jest.fn();
  const view = render(
    <AlertContext.Provider value={{ setAlert: jest.fn(), unsetAlert: jest.fn() }}>
      <CuratorHelperContext.Provider
        value={{
          workflowHelper: {},
          setWorkflowFit: jest.fn(),
          setShowLabels: jest.fn(),
          setWorkflowOnClick: jest.fn(),
          setEditing,
          editing,
          setExternalNodeFormOpen: jest.fn(),
          setDefault: jest.fn(),
        }}
      >
        <CuratorContext.Provider
          value={{
            charts: [{ id: "c0", caption: "A", number: "1" }],
            scripts: [{ id: "s0", readme: "plot.py" }],
            datasets: [],
            tools: [],
            heads: [],
            workflow,
            addEdge: jest.fn(),
            deleteEdge: jest.fn(),
            unlink: jest.fn(),
            add: jest.fn(),
            edit: jest.fn(),
            del: jest.fn(),
            setEdges: jest.fn(),
          }}
        >
          <WorkflowInfoElement />
        </CuratorContext.Provider>
      </CuratorHelperContext.Provider>
    </AlertContext.Provider>
  );
  return { setEditing, ...view };
};

describe("the workflow's saved state", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("is unsaved the first time", () => {
    const { setEditing } = mount();
    expect(setEditing).toHaveBeenLastCalledWith("workflowInfo", true);
  });

  it("remembers a save across a remount", async () => {
    const user = userEvent.setup({ delay: null });
    const first = mount();
    const header = () => screen.getByRole("button", { name: /build your workflow/i });
    expect(header()).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByTestId("workflow-save"));
    expect(first.setEditing).toHaveBeenLastCalledWith("workflowInfo", false);
    first.unmount();

    // Mounted again (e.g. opening a record to edit): still saved, and open
    // like every other section. Only a draft load or a return from the
    // preview closes all sections together.
    const again = mount(WORKFLOW, { workflowInfo: false });
    expect(again.setEditing).toHaveBeenLastCalledWith("workflowInfo", false);
    expect(header()).toHaveAttribute("aria-expanded", "true");
    // Like every other saved section: an Edit pencil, no extra decoration.
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    expect(header()).not.toHaveTextContent(/saved at/i);
  });

  it("is unsaved again once the workflow changes", () => {
    window.sessionStorage.setItem(
      WORKFLOW_SAVED_KEY,
      JSON.stringify({ signature: workflowSignature(WORKFLOW), at: "3:00 PM" })
    );
    const { setEditing } = mount({ ...WORKFLOW, edges: [] });
    expect(setEditing).toHaveBeenLastCalledWith("workflowInfo", true);
  });

  it("ignores order and the legacy edge shape", () => {
    expect(workflowSignature({ nodes: ["c0", "s0"], edges: [["s0", "c0"]] })).toBe(
      workflowSignature({ nodes: ["s0", "c0"], edges: [{ from: "s0", to: "c0" }] })
    );
  });

  it("collapses when the workflow is saved", async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    const header = screen.getByRole("button", { name: /build your workflow/i });
    expect(header).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByTestId("workflow-save"));
    expect(header).toHaveAttribute("aria-expanded", "false");
    // ...and opens again on request.
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
  });
});
