import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ChartsInfoForm, {
  connectedTo,
  resourceEdge,
} from "../components/CuratorForms/ChartsInfoForm";
import CuratorContext from "../Context/Curator/curatorContext";
import CuratorHelperContext from "../Context/CuratorHelpers/curatorHelperContext";
import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";

// Supporting files used to be free text on the chart, invisible to the
// workflow. Now the form picks the paper's own resources and saving draws
// the arrow from each into the figure.

const CHART = {
  id: "c0", caption: "Band structure", number: "1", imageFile: "fig1.png",
  properties: ["band gap"], files: [], notebookFile: "", extraFields: [],
};

const renderForm = ({ def = CHART, edges = [] } = {}) => {
  const curator = {
    charts: def ? [def] : [],
    datasets: [{ id: "d0", readme: "raw.dat" }],
    scripts: [{ id: "s0", readme: "plot.py" }],
    tools: [{ id: "t0", kind: "software", packageName: "Quantum ESPRESSO" }],
    heads: [],
    workflow: { nodes: [], edges },
    add: jest.fn(),
    edit: jest.fn(),
    addEdge: jest.fn(),
    unlink: jest.fn(),
  };
  const helper = {
    chartsHelper: { def, open: true },
    openForm: jest.fn(),
    closeForm: jest.fn(),
    setDefault: jest.fn(),
  };
  render(
    <CuratorContext.Provider value={curator}>
      <CuratorHelperContext.Provider value={helper}>
        <SourceTreeContext.Provider
          value={{ setSaveMethod: jest.fn(), openSelector: jest.fn(), setMultiple: jest.fn() }}
        >
          <ChartsInfoForm hideTrigger />
        </SourceTreeContext.Provider>
      </CuratorHelperContext.Provider>
    </CuratorContext.Provider>
  );
  return { curator, helper };
};

describe("resources behind a figure", () => {
  it("no longer asks for free-text supporting files or a notebook", () => {
    renderForm();
    expect(screen.queryByText(/input \/ supporting files/i)).toBeNull();
    expect(screen.queryByText(/reproduction notebook/i)).toBeNull();
    expect(screen.getByTestId("figure-resources")).toBeInTheDocument();
  });

  it("links picked resources into the figure on save", async () => {
    const user = userEvent.setup({ delay: null });
    const { curator } = renderForm();
    await user.click(screen.getByTestId("figure-resource-d0"));
    await user.click(screen.getByTestId("figure-resource-s0"));
    await user.click(screen.getByTestId("figure-resource-t0"));
    await user.click(screen.getByRole("button", { name: /^update$/i }));
    expect(curator.edit).toHaveBeenCalledTimes(1);
    expect(curator.addEdge.mock.calls.map(([edge]) => edge)).toEqual([
      { from: "d0", to: "c0", type: "consumes" },
      { from: "s0", to: "c0", type: "generates" },
      { from: "t0", to: "c0", type: "links_to" },
    ]);
  });

  it("shows existing links as picked and unlinks one that is unpicked", async () => {
    const user = userEvent.setup({ delay: null });
    const { curator } = renderForm({
      edges: [{ from: "s0", to: "c0", type: "generates" }],
    });
    const script = screen.getByTestId("figure-resource-s0");
    expect(script).toHaveAttribute("aria-pressed", "true");
    await user.click(script);
    await user.click(screen.getByRole("button", { name: /^update$/i }));
    expect(curator.unlink).toHaveBeenCalledWith("s0", "c0");
    expect(curator.addEdge).not.toHaveBeenCalled();
  });

  it("creates a new resource already linked to a saved figure", async () => {
    const user = userEvent.setup({ delay: null });
    const { helper } = renderForm();
    await user.click(screen.getByRole("button", { name: /new dataset/i }));
    expect(helper.openForm).toHaveBeenCalledWith(
      "dataset",
      expect.objectContaining({ sourceArtifactId: "c0" })
    );
  });

  it("helpers", () => {
    expect(resourceEdge("h0", "c1").type).toBe("consumes");
    expect([...connectedTo([["d0", "c0"], { from: "c0", to: "s1" }], "c0")]).toEqual(["d0", "s1"]);
  });
});
