import fs from "fs";
import path from "path";

import {
  ARTIFACT_FIELDS,
  TOOL_EXPERIMENT_FIELDS,
  aiTargets,
  carryLegacy,
  helpFor,
  labelFor,
  missingRequired,
  requiredKeys,
  recommendedKeys,
  missingRecommended,
  toDraft,
  toRecord,
} from "../Utils/artifactFields";

// Folder Analysis and the Add/Edit forms describe the same fields. They used
// to do it from two separate hardcoded lists, and the lists drifted: the same
// field read "Keywords" in one place and "Properties (comma separated)" in
// the other, an input labelled "Keywords" wrote to `URLs`, and optional
// fields were flagged "Needs input".
//
// There is one contract now. These tests fail the moment a form's visible
// label stops matching it, so the two cannot drift again silently.

const read = (file) =>
  fs.readFileSync(
    path.join(__dirname, "..", "components", "CuratorForms", file),
    "utf8"
  );

const labelsIn = (source) =>
  Array.from(source.matchAll(/label="([^"]+)"/g)).map((match) => match[1]);

describe("the contract itself", () => {
  it("stores a chart's keywords in properties, for compatibility", () => {
    // The storage key must never change: every published record has them
    // under `properties` already.
    const keywords = ARTIFACT_FIELDS.chart.find(
      (field) => field.label === "Keywords"
    );
    expect(keywords.key).toBe("properties");
    // Recommended, never required: nothing is required to publish.
    expect(keywords.required).toBe(false);
    expect(keywords.recommended).toBe(true);
  });

  it("names a chart's fields as the figure they describe", () => {
    // A Chart is a figure. Only the LABELS changed -- every storage key is
    // still the one every published record already uses.
    expect(
      ARTIFACT_FIELDS.chart.map((field) => [field.key, field.label])
    ).toEqual([
      ["imageFile", "Figure Image"],
      ["number", "Figure Number"],
      ["caption", "Figure Caption"],
      ["properties", "Keywords"],
      ["files", "Input / Supporting Files"],
      ["notebookFile", "Reproduction Notebook"],
    ]);
  });

  it("never softens a figure caption into a generic description", () => {
    expect(
      ARTIFACT_FIELDS.chart.map((field) => field.label)
    ).not.toContain("Description");
    // ...and says where the text should come from.
    expect(helpFor("chart", "caption")).toMatch(/paper's caption/i);
    expect(helpFor("chart", "caption")).toMatch(
      /concise description of what it shows/i
    );
  });

  it("keeps a Chart singular: one image, per the stored schema", () => {
    const keys = ARTIFACT_FIELDS.chart.map((field) => field.key);
    expect(keys).toContain("imageFile");
    expect(keys).not.toContain("imageFiles");
    expect(keys).not.toContain("relatedImageFiles");
    expect(helpFor("chart", "imageFile")).toMatch(/one image per chart/i);
  });

  it("leaves dataset and script labels alone", () => {
    ["dataset", "script"].forEach((kind) =>
      expect(ARTIFACT_FIELDS[kind].map((field) => field.label)).toEqual([
        "Files",
        "Description",
        "Keywords",
      ])
    );
  });

  it("calls a dataset's and a script's description readme", () => {
    ["dataset", "script"].forEach((kind) => {
      const description = ARTIFACT_FIELDS[kind].find(
        (field) => field.label === "Description"
      );
      expect(description.key).toBe("readme");
      // Optional, but still offered by the guided setup.
      expect(description.required).toBe(false);
      expect(description.recommended).toBe(true);
    });
  });

  it("offers no URL field on a dataset or a script", () => {
    ["dataset", "script"].forEach((kind) => {
      expect(
        ARTIFACT_FIELDS[kind].map((field) => field.key)
      ).not.toContain("URLs");
      expect(
        ARTIFACT_FIELDS[kind].map((field) => field.label)
      ).not.toContain("URLs");
    });
  });

  it("requires nothing, for any type", () => {
    ["chart", "dataset", "script", "tool"].forEach((kind) =>
      expect(requiredKeys(kind)).toEqual([])
    );
    expect(TOOL_EXPERIMENT_FIELDS.filter((field) => field.required)).toEqual([]);
  });

  it("recommends what used to be required, plus captions and descriptions", () => {
    expect(recommendedKeys("chart")).toEqual(["imageFile", "number", "caption", "properties"]);
    expect(recommendedKeys("dataset")).toEqual(["files", "readme"]);
    expect(recommendedKeys("script")).toEqual(["files", "readme"]);
    expect(recommendedKeys("tool")).toEqual(["packageName", "version"]);
    expect(
      TOOL_EXPERIMENT_FIELDS.filter((field) => field.recommended).map((f) => f.key)
    ).toEqual(["facilityName", "measurement"]);
    expect(missingRecommended("dataset", { files: "a", readme: "" })).toEqual(["readme"]);
    expect(missingRequired("dataset", { files: "a", readme: "" })).toEqual([]);
    expect(
      missingRecommended("chart", { imageFile: "", number: "1", caption: "", properties: "k" })
    ).toEqual(["imageFile", "caption"]);
  });

  it("leaves the optional fields optional", () => {
    expect(requiredKeys("chart")).not.toContain("files");
    expect(requiredKeys("chart")).not.toContain("notebookFile");
    expect(requiredKeys("dataset")).not.toContain("keywords");
    expect(requiredKeys("script")).not.toContain("keywords");
    ["executableName", "patches", "description", "urls"].forEach((key) =>
      expect(requiredKeys("tool")).not.toContain(key)
    );
  });
});

describe("AI may only propose what the type can hold", () => {
  it("chart: a caption and its keywords, which are properties", () => {
    expect(aiTargets("chart")).toEqual({
      description: "caption",
      keywords: "properties",
    });
  });

  it("dataset and script: a description and keywords", () => {
    ["dataset", "script"].forEach((kind) =>
      expect(aiTargets(kind)).toEqual({
        description: "readme",
        keywords: "keywords",
      })
    );
  });

  it("tool: a description, and no keyword target at all", () => {
    expect(aiTargets("tool")).toEqual({ description: "description" });
    expect(aiTargets("tool").keywords).toBeUndefined();
  });
});

describe("Needs input: nothing is ever missing for publishing", () => {
  it("recommends a chart's Keywords, and never requires them", () => {
    const draft = { imageFile: "f.png", number: "1", caption: "c", properties: "" };
    expect(missingRequired("chart", draft)).toEqual([]);
    expect(missingRecommended("chart", draft)).toContain("properties");
    expect(
      missingRecommended("dataset", { files: "a.csv", readme: "r", keywords: "" })
    ).not.toContain("keywords");

    const source = fs.readFileSync(
      path.join(__dirname, "..", "Utils", "artifactFields.js"),
      "utf8"
    );
    expect(source).not.toMatch(/an empty Keywords[^.]*is a complete record/i);
  });

  it("lets every field be blank", () => {
    expect(missingRequired("dataset", { files: "", readme: "" })).toEqual([]);
    expect(missingRequired("tool", { packageName: "", version: "" })).toEqual([]);
    expect(missingRequired("chart", {})).toEqual([]);
    // ...while still suggesting what would help.
    expect(missingRecommended("dataset", { files: "", readme: "r" })).toEqual(["files"]);
  });

  it("says nothing about a blank optional field", () => {
    expect(
      missingRequired("dataset", { files: "a.txt", readme: "r", keywords: "" })
    ).toEqual([]);
    expect(
      missingRequired("chart", {
        imageFile: "i.png", number: "1", caption: "c", properties: "k",
        files: "", notebookFile: "",
      })
    ).toEqual([]);
  });
});

describe("draft and record conversion", () => {
  it("builds a draft in contract order, with lists as text", () => {
    const draft = toDraft("dataset", {
      files: ["a.xyz", "b.xyz"],
      readme: "Geometries",
      keywords: ["silicon"],
      URLs: ["https://example.org"],
    });
    expect(Object.keys(draft)).toEqual(["files", "readme", "keywords"]);
    expect(draft.files).toBe("a.xyz, b.xyz");
    expect(draft.keywords).toBe("silicon");
    // A legacy URL never becomes an editable value.
    expect(draft).not.toHaveProperty("URLs");
  });

  it("builds a record with lists split back out", () => {
    const record = toRecord("script", {
      files: "a.py, b.py",
      readme: "Plots",
      keywords: "phonons, vdos",
    });
    expect(record.files).toEqual(["a.py", "b.py"]);
    expect(record.keywords).toEqual(["phonons", "vdos"]);
    expect(record.readme).toBe("Plots");
    // A brand-new record does not invent an empty legacy field.
    expect(record).not.toHaveProperty("URLs");
  });

  it("stamps software on a tool record", () => {
    expect(toRecord("tool", { packageName: "QE", version: "7.2" }).kind).toBe(
      "software"
    );
  });

  it("carries a legacy URLs list through an edit untouched", () => {
    const previous = { files: ["a.xyz"], readme: "old",
                       URLs: ["https://example.org/a"] };
    const next = toRecord("dataset", { files: "a.xyz", readme: "new",
                                       keywords: "silicon" });
    const merged = carryLegacy("dataset", previous, next);

    expect(merged.URLs).toEqual(["https://example.org/a"]);
    expect(merged.keywords).toEqual(["silicon"]);
    expect(merged.readme).toBe("new");
  });

  it("does not create URLs on a record that never had them", () => {
    const merged = carryLegacy("dataset", { files: ["a.xyz"] },
                               toRecord("dataset", { files: "a.xyz" }));
    expect(merged).not.toHaveProperty("URLs");
  });
});

// The parity check. A form label that stops matching the contract fails here
// rather than being noticed in a screenshot.
describe("the Add/Edit forms show exactly the contract's labels", () => {
  it("chart", () => {
    const labels = labelsIn(read("ChartsInfoForm.js"));
    // Supporting files and the notebook are linked resources in the manual
    // form (workflow edges), not free-text fields on the chart.
    const linked = ["files", "notebookFile"];
    ARTIFACT_FIELDS.chart
      .filter((field) => !linked.includes(field.key))
      .forEach((field) => expect(labels).toContain(field.label));
    linked.forEach((key) =>
      expect(labels).not.toContain(
        ARTIFACT_FIELDS.chart.find((field) => field.key === key).label
      )
    );
  });

  it("dataset and script, with no URL input", () => {
    [["DatasetsInfoForm.js", "dataset"], ["ScriptsInfoForm.js", "script"]]
      .forEach(([file, kind]) => {
        const labels = labelsIn(read(file));
        ARTIFACT_FIELDS[kind].forEach((field) =>
          expect(labels).toContain(field.label)
        );
        expect(labels).not.toContain("URLs");
      });
  });

  it("tool, software and experiment", () => {
    const labels = labelsIn(read("ToolsInfoForm.js"));
    ARTIFACT_FIELDS.tool.forEach((field) =>
      expect(labels).toContain(field.label)
    );
    TOOL_EXPERIMENT_FIELDS.forEach((field) =>
      expect(labels).toContain(field.label)
    );
    expect(labels).toContain("Type");
    // A tool has no keyword field anywhere.
    expect(labels).not.toContain("Keywords");
  });

  it("labelFor answers with what the form shows", () => {
    expect(labelFor("chart", "properties")).toBe("Keywords");
    expect(labelFor("chart", "number")).toBe("Figure Number");
    expect(labelFor("chart", "imageFile")).toBe("Figure Image");
    expect(labelFor("chart", "caption")).toBe("Figure Caption");
    expect(labelFor("chart", "files")).toBe("Input / Supporting Files");
    expect(labelFor("chart", "notebookFile")).toBe("Reproduction Notebook");
    expect(labelFor("dataset", "readme")).toBe("Description");
    expect(labelFor("tool", "packageName")).toBe("Package Name");
  });
});
