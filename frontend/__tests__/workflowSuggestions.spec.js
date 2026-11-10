import {
  describeSuggestion,
  fingerprint,
  normalizeRef,
  suggestConnections,
  suggestionKey,
} from "../Utils/workflowSuggestions";

// A suggestion is a CLAIM about someone's research. The tests that matter
// most here are the ones proving a claim is NOT made: a curator who is shown
// a wrong connection alongside right ones has to check all of them, which is
// more work than connecting them by hand.

const chart = (over = {}) => ({
  id: "c0",
  caption: "Density of states",
  imageFile: "figures/dos.png",
  files: [],
  properties: [],
  ...over,
});
const script = (over = {}) => ({ id: "s0", files: [], readme: "", ...over });
const dataset = (over = {}) => ({ id: "d0", files: [], readme: "", ...over });

const only = (lists, edges = []) => {
  const found = suggestConnections(lists, edges);
  expect(found).toHaveLength(1);
  return found[0];
};

describe("normalizeRef — what may be compared at all", () => {
  it("regularises a relative path to one comparable form", () => {
    expect(normalizeRef("figures/dos.ipynb")).toBe("figures/dos.ipynb");
    expect(normalizeRef("./figures/dos.ipynb")).toBe("figures/dos.ipynb");
    expect(normalizeRef("figures//dos.ipynb")).toBe("figures/dos.ipynb");
    expect(normalizeRef("  figures/dos.ipynb  ")).toBe("figures/dos.ipynb");
    expect(normalizeRef("figures\\dos.ipynb")).toBe("figures/dos.ipynb");
    expect(normalizeRef("runs/../figures/dos.ipynb")).toBe("figures/dos.ipynb");
  });

  it("refuses anything it could not show a reader", () => {
    // Each of these would have to be printed in the reason to justify the
    // suggestion, and none of them belongs in a published record.
    expect(normalizeRef("/home/ada/run/dos.ipynb")).toBe("");
    expect(normalizeRef("C:\\work\\dos.ipynb")).toBe("");
    expect(normalizeRef("\\\\share\\work\\dos.ipynb")).toBe("");
    expect(normalizeRef("https://example.org/dos.ipynb")).toBe("");
    expect(normalizeRef("../../outside/dos.ipynb")).toBe("");
    expect(normalizeRef("")).toBe("");
    expect(normalizeRef(null)).toBe("");
  });

  it("keeps case, because these files live on case-sensitive machines", () => {
    expect(normalizeRef("DOS.ipynb")).not.toBe(normalizeRef("dos.ipynb"));
  });
});

describe("evidence that proves a connection", () => {
  it("offers generates when the figure names the script's file", () => {
    const found = only({
      charts: [chart({ notebookFile: "figures/dos.ipynb" })],
      scripts: [script({ files: ["figures/dos.ipynb"] })],
    });

    expect(found).toMatchObject({
      type: "generates",
      from: "s0",
      to: "c0",
      reference: "figures/dos.ipynb",
    });
  });

  it("offers consumes when the figure's own input is a saved dataset", () => {
    const found = only({
      charts: [chart({ files: ["data/spectra.csv"] })],
      datasets: [dataset({ files: ["data/spectra.csv"] })],
    });

    expect(found).toMatchObject({
      type: "consumes",
      from: "d0",
      to: "c0",
      reference: "data/spectra.csv",
    });
  });

  it("matches through the same file written two ways", () => {
    const found = only({
      charts: [chart({ notebookFile: "./figures/dos.ipynb" })],
      scripts: [script({ files: ["figures\\dos.ipynb"] })],
    });
    expect(found.reference).toBe("figures/dos.ipynb");
  });

  it("proposes one edge, not one per shared file", () => {
    // Two datasets' worth of shared paths on ONE dataset is still one
    // relationship. Two suggestions for it would be two chances to make a
    // duplicate.
    const found = only({
      charts: [chart({ files: ["data/a.csv", "data/b.csv"] })],
      datasets: [dataset({ files: ["data/a.csv", "data/b.csv"] })],
    });
    expect(found.type).toBe("consumes");
  });

  it("says what it would do and why, in one sentence", () => {
    const found = only({
      charts: [chart({ notebookFile: "figures/dos.ipynb" })],
      scripts: [script({ files: ["figures/dos.ipynb"] })],
    });
    const labels = { s0: "plot_dos.py", c0: "Density of states" };

    expect(describeSuggestion(found, (id) => labels[id])).toBe(
      "Connect plot_dos.py as generating this figure — " +
        "both reference figures/dos.ipynb."
    );
  });
});

describe("evidence too weak to act on", () => {
  it("will not match a shared filename under different folders", () => {
    // The single most tempting wrong match: same name, different file.
    expect(
      suggestConnections({
        charts: [chart({ notebookFile: "figures/dos.ipynb" })],
        scripts: [script({ files: ["notebooks/dos.ipynb"] })],
      })
    ).toEqual([]);
  });

  it("will not match a shared folder", () => {
    expect(
      suggestConnections({
        charts: [chart({ files: ["data/spectra.csv"] })],
        datasets: [dataset({ files: ["data/other.csv"] })],
      })
    ).toEqual([]);
  });

  it("will not match a shared stem across file types", () => {
    expect(
      suggestConnections({
        charts: [chart({ notebookFile: "figures/dos.ipynb" })],
        scripts: [script({ files: ["figures/dos.py"] })],
      })
    ).toEqual([]);
  });

  it("ignores captions, descriptions and keywords entirely", () => {
    // Everything here agrees except a saved path, and a path is the only
    // thing that states a relationship.
    expect(
      suggestConnections({
        charts: [
          chart({
            caption: "Density of states",
            properties: ["dos", "silicon"],
            notebookFile: "",
          }),
        ],
        scripts: [
          script({
            readme: "Density of states plotting script",
            keywords: ["dos", "silicon"],
            files: ["run/plot.py"],
          }),
        ],
        datasets: [
          dataset({ readme: "Density of states", keywords: ["dos"] }),
        ],
      })
    ).toEqual([]);
  });

  it("never proposes Dataset -> Script, which the model cannot prove", () => {
    // A Script's `files` is its own source, not a declared input. An equal
    // path means the same file was filed twice, not that one consumed the
    // other.
    expect(
      suggestConnections({
        scripts: [script({ files: ["data/spectra.csv"] })],
        datasets: [dataset({ files: ["data/spectra.csv"] })],
      })
    ).toEqual([]);
  });

  it("never proposes Tool -> Script, which has no field to prove it", () => {
    expect(
      suggestConnections({
        scripts: [script({ files: ["run/plot.py"], keywords: ["numpy"] })],
        tools: [{ id: "t0", packageName: "numpy", version: "1.26.4" }],
      })
    ).toEqual([]);
  });

  it("does not treat a URL as a path", () => {
    expect(
      suggestConnections({
        charts: [chart({ files: ["https://example.org/spectra.csv"] })],
        datasets: [dataset({ files: ["https://example.org/spectra.csv"] })],
      })
    ).toEqual([]);
  });

  it("does not match on an absolute path both artifacts happen to hold", () => {
    expect(
      suggestConnections({
        charts: [chart({ notebookFile: "/home/ada/dos.ipynb" })],
        scripts: [script({ files: ["/home/ada/dos.ipynb"] })],
      })
    ).toEqual([]);
  });

  it("says nothing about a paper with nothing to prove", () => {
    expect(suggestConnections({ charts: [chart()], scripts: [script()] }))
      .toEqual([]);
    expect(suggestConnections({})).toEqual([]);
  });
});

describe("what a suggestion may never do", () => {
  it("cannot reach an artifact from another paper", () => {
    // The other paper's script is not in these lists, so there is no id for
    // it and no edge that could name it.
    const foreign = script({ id: "s0", files: ["figures/dos.ipynb"] });
    expect(
      suggestConnections({
        charts: [chart({ notebookFile: "figures/dos.ipynb" })],
        scripts: [],
      })
    ).toEqual([]);

    // Present it as the paper's own and it becomes ordinary evidence --
    // which is the point: membership of the list IS the paper boundary.
    expect(
      suggestConnections({
        charts: [chart({ notebookFile: "figures/dos.ipynb" })],
        scripts: [foreign],
      })
    ).toHaveLength(1);
  });

  it("does not re-suggest a connection the paper already has", () => {
    const lists = {
      charts: [chart({ notebookFile: "figures/dos.ipynb" })],
      scripts: [script({ files: ["figures/dos.ipynb"] })],
    };
    expect(suggestConnections(lists, [])).toHaveLength(1);
    expect(
      suggestConnections(lists, [{ from: "s0", to: "c0", type: "generates" }])
    ).toEqual([]);
  });

  it("does not re-suggest one held as a legacy untyped pair", () => {
    // A legacy edge states no type, but it does state that these two are
    // connected -- so there is nothing left to offer.
    expect(
      suggestConnections(
        {
          charts: [chart({ notebookFile: "figures/dos.ipynb" })],
          scripts: [script({ files: ["figures/dos.ipynb"] })],
        },
        [["s0", "c0"]]
      )
    ).toEqual([]);
  });

  it("does not offer a reversed duplicate of an existing connection", () => {
    expect(
      suggestConnections(
        {
          charts: [chart({ notebookFile: "figures/dos.ipynb" })],
          scripts: [script({ files: ["figures/dos.ipynb"] })],
        },
        [{ from: "c0", to: "s0", type: "" }]
      )
    ).toEqual([]);
  });

  it("only ever targets a figure", () => {
    // Every rule here ends at a chart. Nothing in this module can produce an
    // edge pointing anywhere else, whatever the lists contain.
    const found = suggestConnections({
      charts: [
        chart({ notebookFile: "figures/dos.ipynb" }),
        chart({ id: "c1", imageFile: "figures/b.png", files: ["data/a.csv"] }),
      ],
      scripts: [script({ files: ["figures/dos.ipynb"] })],
      datasets: [dataset({ files: ["data/a.csv"] })],
    });
    expect(found.map((s) => s.to)).toEqual(["c0", "c1"]);
    expect(found.map((s) => s.type)).toEqual(["generates", "consumes"]);
  });

  it("refuses evidence whose id claims the wrong kind", () => {
    // A dataset filed into the scripts list is not a script. The rule that
    // reads that list checks the id it is given rather than trusting where
    // it was found.
    expect(
      suggestConnections({
        charts: [chart({ notebookFile: "figures/dos.ipynb" })],
        scripts: [{ id: "d9", files: ["figures/dos.ipynb"] }],
      })
    ).toEqual([]);
  });

  it("will not close a loop", () => {
    // The chart already feeds the script; generating it too would make the
    // figure help produce itself.
    expect(
      suggestConnections(
        {
          charts: [chart({ notebookFile: "figures/dos.ipynb" })],
          scripts: [script({ files: ["figures/dos.ipynb"] })],
        },
        [{ from: "c0", to: "s0", type: "consumes" }]
      )
    ).toEqual([]);
  });
});

describe("identity that survives renumbering", () => {
  // Artifact ids are positional, so deleting one shifts the rest. A
  // suggestion remembered by id would follow the NUMBER to whatever artifact
  // inherits it.
  const before = {
    charts: [chart({ notebookFile: "figures/dos.ipynb" })],
    scripts: [
      script({ id: "s0", files: ["other/first.py"] }),
      script({ id: "s1", files: ["figures/dos.ipynb"] }),
    ],
  };

  it("keys a suggestion by content, not by position", () => {
    const first = only(before);
    expect(first.from).toBe("s1");

    // The unrelated script is deleted, so the real one is renumbered to s0.
    const after = {
      charts: before.charts,
      scripts: [script({ id: "s0", files: ["figures/dos.ipynb"] })],
    };
    const second = only(after);

    expect(second.from).toBe("s0");
    // Different id, same suggestion -- so a dismissal still applies.
    expect(suggestionKey(second)).toBe(suggestionKey(first));
  });

  it("does not carry a dismissal onto the artifact that took the number", () => {
    const first = only(before);

    // Now the MATCHING script is the one deleted, and a different script
    // inherits s1 along with different evidence.
    const after = {
      charts: [chart({ files: ["data/a.csv"], notebookFile: "" })],
      scripts: [script({ id: "s0", files: ["other/first.py"] })],
      datasets: [dataset({ id: "d0", files: ["data/a.csv"] })],
    };
    const second = only(after);

    expect(suggestionKey(second)).not.toBe(suggestionKey(first));
  });

  it("fingerprints by saved content and never by id", () => {
    expect(fingerprint({ id: "s0", files: ["a.py"] })).toBe(
      fingerprint({ id: "s7", files: ["a.py"] })
    );
    expect(fingerprint({ id: "s0", files: ["a.py"] })).not.toBe(
      fingerprint({ id: "s0", files: ["b.py"] })
    );
    expect(fingerprint(null)).toBe("");
  });
});
