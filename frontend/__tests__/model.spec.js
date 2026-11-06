import {
  convertReqSchematoState,
  convertStateToUpdatePayload,
  convertStatetoReqSchema,
} from "../Utils/model";

import paperDoc from "./fixtures/paperDoc.json";

// Conversion layer for the curator edit flow: stored document -> curator
// state -> PUT payload, exercised with the same fixture the backend suite
// uses (a real published-record shape).
describe("convertReqSchematoState", () => {
  const state = convertReqSchematoState(paperDoc);

  it("maps curator/insertedBy info", () => {
    expect(state.curatorInfo.emailId).toBe("john.doe@company.com");
    expect(state.curatorInfo.firstName).toBe("John");
  });

  it("loads the reference block into the canonical primary-paper referenceInfo", () => {
    expect(state.referenceInfo.publication).toContain(
      "Journal of the American Chemical Society"
    );
    expect(state.referenceInfo.publication).toContain("2016");
    expect(state.referenceInfo.title).toBe(paperDoc.reference.title);
    expect(state.referenceInfo.doi).toBe(paperDoc.reference.DOI);
  });

  it("stringifies PI and author names", () => {
    expect(state.paperInfo.PIs).toContain("Giulia");
    expect(state.paperInfo.PIs).toContain("Galli");
    expect(state.referenceInfo.authors).toContain("Gaiduk");
  });

  it("keeps section lists and converts workflow edges to objects", () => {
    expect(state.charts).toHaveLength(paperDoc.charts.length);
    expect(state.datasets).toHaveLength(paperDoc.datasets.length);
    expect(state.tools).toHaveLength(paperDoc.tools.length);
    expect(state.scripts).toHaveLength(paperDoc.scripts.length);
    // A legacy pair reads as an edge with NO type. Nothing infers one --
    // guessing what an old curator meant is not something this can do.
    expect(state.workflow.edges[0]).toEqual({
      from: paperDoc.workflow.edges[0][0],
      to: paperDoc.workflow.edges[0][1],
      type: "",
    });
    expect(state.license).toBe("cc");
  });

  // Workflow V1 gives an edge a meaning. Both shapes have to survive a full
  // trip in either direction, and a legacy record must come back out in the
  // shape it went in.
  describe("workflow edges round-trip in both shapes", () => {
    const roundTrip = (edges) =>
      convertStatetoReqSchema(
        convertReqSchematoState({
          reference: { title: "t" },
          workflow: { nodes: [], edges },
        })
      ).workflow.edges;

    it("keeps a typed edge typed", () => {
      expect(roundTrip([{ from: "s0", to: "c0", type: "generates" }])).toEqual([
        { from: "s0", to: "c0", type: "generates" },
      ]);
    });

    it("writes a legacy pair back as the pair it arrived as", () => {
      // Opening an old record and saving it must not rewrite its graph into
      // a shape it never had.
      expect(roundTrip([["s0", "c0"]])).toEqual([["s0", "c0"]]);
    });

    it("keeps a mixed graph mixed", () => {
      // What a curator who edits half an old graph actually produces.
      expect(
        roundTrip([["d0", "s0"], { from: "s0", to: "c0", type: "generates" }])
      ).toEqual([["d0", "s0"], { from: "s0", to: "c0", type: "generates" }]);
    });

    it("does not turn a typed edge into two undefineds", () => {
      // The bug this replaces: the reader assumed an array, so a typed edge
      // came back as {from: undefined, to: undefined}.
      const state = convertReqSchematoState({
        reference: { title: "t" },
        workflow: { nodes: [], edges: [{ from: "d0", to: "s0", type: "consumes" }] },
      });
      expect(state.workflow.edges[0].from).toBe("d0");
      expect(state.workflow.edges[0].to).toBe("s0");
    });
  });

  it("tolerates legacy records with missing sections", () => {
    const minimal = convertReqSchematoState({
      reference: { title: "t" },
      collections: ["c"],
      tags: ["x"],
    });
    expect(minimal.referenceInfo.title).toBe("t");
    expect(minimal.charts).toEqual([]);
    expect(minimal.workflow).toEqual({ nodes: [], edges: [] });
    expect(minimal.documentation).toBe("");
  });

  // Optional and record-level: a record published before the field existed
  // has no `institution` key at all, and that must load as "", not throw or
  // surface as undefined in the edit form's text input.
  it("defaults institution to an empty string on a record that predates it", () => {
    expect(state.paperInfo.institution).toBe("");
    const minimal = convertReqSchematoState({ reference: { title: "t" } });
    expect(minimal.paperInfo.institution).toBe("");
  });

  it("loads a curator-entered institution unchanged", () => {
    const withInstitution = convertReqSchematoState({
      ...paperDoc,
      institution: "University of Chicago",
    });
    expect(withInstitution.paperInfo.institution).toBe(
      "University of Chicago"
    );
  });

  // Two fields, two levels, two meanings. `insertedBy.affiliation` is where
  // the PERSON doing the curating works; `institution` is about the RECORD.
  // They live at different levels of the document and neither is derived from
  // the other -- a curator at Duke can curate a paper from UChicago, and the
  // record must be able to say so.
  describe("curator affiliation is not the record's institution", () => {
    const withAffiliation = {
      ...paperDoc,
      info: {
        ...paperDoc.info,
        insertedBy: { ...paperDoc.info.insertedBy, affiliation: "Duke University" },
      },
    };

    it("does not fill institution from the curator's affiliation", () => {
      const loaded = convertReqSchematoState(withAffiliation);
      expect(loaded.curatorInfo.affiliation).toBe("Duke University");
      // The record says nothing about an institution, and loading a curator
      // who has one does not invent one.
      expect(loaded.paperInfo.institution).toBe("");
    });

    it("keeps the two apart when both are set to different values", () => {
      const loaded = convertReqSchematoState({
        ...withAffiliation,
        institution: "University of Chicago",
      });
      expect(loaded.curatorInfo.affiliation).toBe("Duke University");
      expect(loaded.paperInfo.institution).toBe("University of Chicago");
    });

    it("sends them back as two separate fields", () => {
      const loaded = convertReqSchematoState({
        ...withAffiliation,
        institution: "University of Chicago",
      });
      const payload = convertStateToUpdatePayload(loaded, paperDoc, null);
      expect(payload.institution).toBe("University of Chicago");
      expect(payload.info.insertedBy.affiliation).toBe("Duke University");
    });

    it("does not fill the curator's affiliation from the record", () => {
      const loaded = convertReqSchematoState({
        ...paperDoc,
        info: {
          ...paperDoc.info,
          insertedBy: { ...paperDoc.info.insertedBy, affiliation: "" },
        },
        institution: "University of Chicago",
      });
      expect(loaded.paperInfo.institution).toBe("University of Chicago");
      expect(loaded.curatorInfo.affiliation).toBe("");
    });
  });
});

describe("convertStateToUpdatePayload round trip", () => {
  const state = convertReqSchematoState(paperDoc);
  const payload = convertStateToUpdatePayload(state, paperDoc, null);

  it("round-trips reference data", () => {
    expect(payload.reference.title).toBe(paperDoc.reference.title);
    expect(payload.reference.journal.fullName).toBe(
      paperDoc.reference.journal.fullName
    );
    expect(String(payload.reference.volume)).toBe(
      String(paperDoc.reference.volume)
    );
    expect(payload.reference.page).toBe(paperDoc.reference.page);
    expect(payload.reference.DOI).toBe(paperDoc.reference.DOI);
    const names = payload.reference.authors.map(
      (a) => `${a.firstName} ${a.lastName}`
    );
    expect(names).toContain("Alex Gaiduk");
  });

  it("round-trips charts/datasets/tools/scripts and workflow edges", () => {
    expect(payload.charts).toHaveLength(paperDoc.charts.length);
    expect(payload.charts[0].caption).toBe(paperDoc.charts[0].caption);
    expect(payload.datasets).toEqual(paperDoc.datasets);
    expect(payload.tools).toHaveLength(paperDoc.tools.length);
    expect(payload.scripts).toHaveLength(paperDoc.scripts.length);
    expect(payload.workflow.edges).toEqual(paperDoc.workflow.edges);
  });

  it("preserves fields the curator does not manage", () => {
    expect(payload.schema).toBe(paperDoc.schema);
    expect(payload.info.downloadPath).toBe(paperDoc.info.downloadPath);
    expect(payload.info.gitPath).toBe(paperDoc.info.gitPath);
    expect(payload.info.isPublic).toBe(paperDoc.info.isPublic);
    expect(payload.info.insertedBy.emailId).toBe(
      paperDoc.info.insertedBy.emailId
    );
  });

  it("never adds a citedReference block (one paper, one reference record)", () => {
    expect(payload).not.toHaveProperty("citedReference");
    expect(payload).not.toHaveProperty("publicationInfo");
  });

  it("never carries identity/server-owned fields", () => {
    expect(payload).not.toHaveProperty("owner_email");
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("_id");
    expect(payload).not.toHaveProperty("version");
    expect(payload).not.toHaveProperty("versions");
  });

  it("round-trips a blank institution as an empty string, not omitted", () => {
    // paperDoc predates the field: the payload must still carry the key so a
    // PUT can clear a previously-set value, rather than the key vanishing.
    expect(payload.institution).toBe("");
  });

  it("round-trips a curator-entered institution", () => {
    const withInstitution = convertReqSchematoState({
      ...paperDoc,
      institution: "University of Chicago",
    });
    const withPayload = convertStateToUpdatePayload(
      withInstitution,
      paperDoc,
      null
    );
    expect(withPayload.institution).toBe("University of Chicago");
  });
});
