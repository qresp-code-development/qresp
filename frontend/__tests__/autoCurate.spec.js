import reducer from "../Context/Curator/curatorReducer";
import { IMPORT_BUNDLE } from "../Context/types";
import {
  buildImportPlan,
  countByList,
  curatorFromProfile,
  curatorIsBlank,
  recordsNeedingDetails,
  referenceFromCrossref,
} from "../Utils/autoCurate";

const emptyState = () => ({
  curatorInfo: {},
  referenceInfo: {},
  paperInfo: { tags: [] },
  charts: [],
  datasets: [],
  scripts: [],
  tools: [],
  heads: [],
  workflow: { nodes: [], edges: [] },
});

describe("curatorFromProfile", () => {
  it("splits the profile name and carries email and affiliation", () => {
    expect(
      curatorFromProfile({
        name: "Samuel James Taylor",
        email: "s@uchicago.edu",
        affiliation: "UChicago",
      })
    ).toEqual({
      firstName: "Samuel",
      middleName: "James",
      lastName: "Taylor",
      emailId: "s@uchicago.edu",
      affiliation: "UChicago",
    });
  });

  it("does not turn an email-as-name into a first name", () => {
    expect(curatorFromProfile({ name: "a@b.co", email: "a@b.co" }).firstName).toBe("");
  });

  it("knows a blank curator", () => {
    expect(curatorIsBlank({ firstName: "", emailId: "" })).toBe(true);
    expect(curatorIsBlank({ firstName: "A" })).toBe(false);
  });
});

describe("referenceFromCrossref", () => {
  it("builds the same shape the reference form saves", () => {
    const ref = referenceFromCrossref({
      type: "journal-article",
      title: ["An NV center in MgO"],
      "container-title": ["npj Computational Materials"],
      volume: "11",
      page: "1",
      issued: { "date-parts": [[2025]] },
      DOI: "10.1038/s41524-025-01558-w",
      URL: "https://doi.org/10.1038/s41524-025-01558-w",
      author: [
        { given: "Vrindaa", family: "Somjit" },
        { given: "Giulia", family: "Galli" },
      ],
    });
    expect(ref).toMatchObject({
      kind: "journal",
      title: "An NV center in MgO",
      doi: "10.1038/s41524-025-01558-w",
      year: 2025,
      authors: "Vrindaa  Somjit, Giulia  Galli",
      publication: "npj Computational Materials 2025, 11 ,1",
    });
  });
});

const analysis = {
  candidates: {
    charts: [
      { id: "chart-0", proposal: { imageFile: "Figures_Tables/Figure2.pdf", files: [] } },
      { id: "chart-1", proposal: { imageFile: "Figures_Tables/Table1.png", files: [] } },
    ],
    datasets: [{ id: "dataset-0", label: "Figure_2_data", proposal: { files: ["Data/Figure_2_data"], readme: "" } }],
    scripts: [{ id: "script-0", proposal: { files: ["Scripts/plot.py"], readme: "Plots it" } }],
    tools: [],
  },
  suggestions: {
    numbers: { "chart-0": "2", "chart-1": "Table 1" },
    links: [
      { from: "dataset-0", to: "chart-0", type: "consumes", reason: "named after", confidence: "high" },
      { from: "dataset-0", to: "missing-9", type: "consumes", reason: "x", confidence: "high" },
    ],
  },
};

describe("buildImportPlan", () => {
  it("applies suggested figure numbers and the paper's tags", () => {
    const plan = buildImportPlan(analysis, { state: emptyState(), paperTags: ["DFT", "spin defect"] });
    const chart = plan.items.find((item) => item.key === "cand:chart-0");
    expect(chart.value.number).toBe("2");
    expect(chart.value.properties).toEqual(["DFT", "spin defect"]);
    // The caption is optional, so nothing is missing.
    expect(chart.missing).toEqual([]);
    expect(countByList(plan.items)).toEqual({ charts: 2, datasets: 1, scripts: 1, tools: 0 });
  });

  it("keeps only links between items it would add", () => {
    const plan = buildImportPlan(analysis, { state: emptyState() });
    expect(plan.links).toEqual([
      expect.objectContaining({ from: "cand:dataset-0", to: "cand:chart-0", type: "consumes" }),
    ]);
  });

  it("marks items already in the record as duplicates", () => {
    const state = { ...emptyState(), charts: [{ id: "c0", imageFile: "/Figures_Tables/Figure2.pdf" }] };
    const plan = buildImportPlan(analysis, { state });
    expect(plan.items.find((i) => i.key === "cand:chart-0").duplicate).toBe(true);
    expect(plan.items.find((i) => i.key === "cand:chart-1").duplicate).toBe(false);
  });
});

describe("IMPORT_BUNDLE", () => {
  it("adds every kind in one change and translates links to minted ids", () => {
    const plan = buildImportPlan(analysis, { state: emptyState() });
    const next = reducer(emptyState(), {
      type: IMPORT_BUNDLE,
      payload: {
        records: plan.items.map(({ key, list, value }) => ({ key, list, value })),
        links: plan.links,
      },
    });
    expect(next.charts.map((c) => c.id)).toEqual(["c0", "c1"]);
    expect(next.datasets.map((d) => d.id)).toEqual(["d0"]);
    expect(next.scripts.map((s) => s.id)).toEqual(["s0"]);
    expect(next.workflow.edges).toEqual([{ from: "d0", to: "c0", type: "consumes" }]);
  });

  it("skips a link the graph rules refuse but keeps the records", () => {
    const next = reducer(emptyState(), {
      type: IMPORT_BUNDLE,
      payload: {
        records: [
          { key: "a", list: "charts", value: { imageFile: "x.png" } },
          { key: "b", list: "scripts", value: { files: ["p.py"] } },
        ],
        // charts never "consume" scripts
        links: [{ from: "a", to: "b", type: "consumes" }],
      },
    });
    expect(next.charts).toHaveLength(1);
    expect(next.scripts).toHaveLength(1);
    expect(next.workflow.edges).toEqual([]);
  });

  it("mints ids after existing records", () => {
    const state = { ...emptyState(), charts: [{ id: "c0", imageFile: "old.png" }] };
    const next = reducer(state, {
      type: IMPORT_BUNDLE,
      payload: { records: [{ key: "a", list: "charts", value: { imageFile: "new.png" } }], links: [] },
    });
    expect(next.charts.map((c) => c.id)).toEqual(["c0", "c1"]);
  });
});

describe("recordsNeedingDetails", () => {
  it("lists records with required fields still empty", () => {
    const state = {
      ...emptyState(),
      charts: [
        { id: "c0", imageFile: "a.png", number: "1", caption: "", properties: ["x"] },
        { id: "c1", imageFile: "b.png", number: "2", caption: "Done", properties: ["x"] },
      ],
      datasets: [{ id: "d0", files: ["Data/x"], readme: "" }],
      tools: [{ id: "t0", kind: "experiment", facilityName: "APS", measurement: "XRD" }],
    };
    // Captions and descriptions are optional: nothing is required here...
    expect(recordsNeedingDetails(state)).toEqual([]);
    // ...but a surface that offers recommended fields still lists them.
    const needing = recordsNeedingDetails(state, { recommended: true });
    expect(needing.map((n) => [n.record.id, n.missing])).toEqual([
      ["c0", ["caption"]],
      ["d0", ["readme"]],
    ]);
  });
});

describe("IMPORT_BUNDLE with existing records", () => {
  it("adds validated links between records already in the form", () => {
    const state = {
      ...emptyState(),
      charts: [{ id: "c0", imageFile: "a.png" }],
      scripts: [{ id: "s0", files: ["p.py"] }],
      datasets: [{ id: "d0", files: ["Data/x"] }],
    };
    const next = reducer(state, {
      type: IMPORT_BUNDLE,
      payload: {
        records: [],
        links: [
          { from: "s0", to: "c0", type: "generates" },
          { from: "d0", to: "s0", type: "consumes" },
          { from: "s9", to: "c0", type: "generates" },
          { from: "c0", to: "s0", type: "generates" },
        ],
      },
    });
    expect(next.workflow.edges).toEqual([
      { from: "s0", to: "c0", type: "generates" },
      { from: "d0", to: "s0", type: "consumes" },
    ]);
  });
});
