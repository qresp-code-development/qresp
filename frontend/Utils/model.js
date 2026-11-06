import { getServer, namesUtil, referenceUtil } from "./utils";
import { fromStoredEdge, toStoredEdge } from "./workflowGraph";
import { workTypeOf } from "./workTypes";

const convertStateToViewSchema = (state, serverInformation) => {
  const schema = {
    ...state.curatorInfo,
    ...state.referenceInfo,
    ...state.paperInfo,
    // PIs: state.paperInfo.PIs,
    // abstract: state.referenceInfo.abstract,
    // authors: state.referenceInfo.authors,
    // collections: state.paperInfo.collections,
    // publication: state.referenceInfo.publication,
    // doi: state.referenceInfo.doi,
    documentation: state.documentation,
    fileServerPath: state.fileServerPath,
    charts: state.charts,
    tools: state.tools,
    datasets: state.datasets,
    scripts: state.scripts,
    heads: state.heads,
    workflows: state.workflow,
  };

  return schema;
};

const convertViewSchemaToState = (schema) => {};

// The bibliographic state slice ({kind, doi, authors, title, publication,
// year, url, abstract}) -> the stored `reference` block shape — the ONE
// canonical primary-paper record that search/details/publish/dedup read.
const referenceBlockFromInfo = (info = {}) => {
  const block = { ...referenceUtil.get(info.publication) };
  block.journal = { fullName: block.journal };
  block["DOI"] = info.doi;
  block["URLs"] = info.url;
  block["publishedAbstract"] = info.abstract;
  block["kind"] = info.kind;
  block["title"] = info.title;
  block["authors"] = namesUtil.get(info.authors || "");
  // The publication string carries the year for a paper; a work filled in
  // without one (a code repository from its GitHub page) has it on its own.
  if (block.year == null && info.year != null && info.year !== "") {
    const year = parseInt(info.year, 10);
    if (!Number.isNaN(year)) block.year = year;
  }
  return block;
};

const convertStatetoReqSchema = (state, servers) => {
  const biblio = state.referenceInfo || {};
  const info = {
    // Required KEYS (schema.json), blank when there is no DOI.
    ProjectName: biblio.doi || "",
    doi: biblio.doi || "",
    timeStamp: new Date().toLocaleString().replace(",", ""),
    notebookFile: state.paperInfo.notebookFile,
    notebookPath: state.paperInfo.notebookPath,
    fileServerPath: state.fileServerPath,
    gitPath: servers && servers.gitPath ? "Y" : "",
    downloadPath: servers && servers.downloadPath ? servers.downloadPath : "",
    insertedBy: { ...state.curatorInfo },
  };

  const reference = referenceBlockFromInfo(biblio);

  const schema = {
    // What is curated; see Utils/workTypes.js. Every legacy draft is a paper.
    work_type: workTypeOf(state.workType),
    PIs: namesUtil.get(state.paperInfo.PIs),
    collections: state.paperInfo.collections || [],
    tags: state.paperInfo.tags || [],
    license: state.license || "cc_by",
    // Record-level, optional -- see project.models.Paper.institution on the
    // backend. Never derived from PIs/collections/servers/DOIs; whatever the
    // curator typed (or left blank) here is the whole answer.
    institution: state.paperInfo.institution || "",
    documentation: { readme: state.documentation },
    workflow: {
      ...state.workflow,
      // A TYPED edge is written as an object; an untyped one is written back
      // as the pair it arrived as. Opening a legacy record and saving it must
      // not silently rewrite its graph into a shape it never had.
      edges: state.workflow.edges.map(toStoredEdge),
    },
    // A figure may be published with no number yet.
    charts: state.charts.map((chart) => ({
      ...chart,
      number: chart.number == null ? "" : chart.number.toString(),
    })),
    schema: getServer() + "/schema_v1.2.json",
    scripts: state.scripts,
    tools: state.tools,
    datasets: state.datasets,
    heads: state.heads,
    info,
    reference,
  };

  return schema;
};

// Persons coming out of MongoDB may carry extra keys (emailId, ...);
// namesUtil.set concatenates every value, so trim to the name triple.
const cleanName = (name) => ({
  firstName: (name && name.firstName) || "",
  middleName: (name && name.middleName) || "",
  lastName: (name && name.lastName) || "",
});

// Stored reference-block shape -> one bibliographic state slice (the exact
// inverse of referenceBlockFromInfo). Unwraps journal.fullName for the
// publication string (referenceUtil.set takes a single object).
const infoFromReferenceBlock = (block = {}) => ({
  kind: block.kind || "",
  doi: block.DOI || "",
  authors: namesUtil.set((block.authors || []).map(cleanName)),
  title: block.title || "",
  publication: referenceUtil.set({
    journal: (block.journal && block.journal.fullName) || "",
    year: block.year != null ? block.year : "",
    page: block.page || "",
    volume: block.volume != null ? block.volume : "",
  }),
  year: block.year != null ? block.year : null,
  url: block.URLs || "",
  abstract: block.publishedAbstract || "",
});

// Stored/request schema document -> curator state (the exact inverse of
// convertStatetoReqSchema). Defensive about legacy records with missing
// sections. The `reference` block IS the primary paper's bibliography and
// loads into referenceInfo — every existing record reads unchanged.
const convertReqSchematoState = (req) => {
  const info = req.info || {};
  const workflow = req.workflow || {};
  const documentation = req.documentation || {};

  const state = {
    curatorInfo: {
      firstName: "",
      middleName: "",
      lastName: "",
      emailId: "",
      affiliation: "",
      ...(info.insertedBy || {}),
    },
    fileServerPath: info.fileServerPath || "",
    paperInfo: {
      PIs: namesUtil.set((req.PIs || []).map(cleanName)),
      collections: req.collections || [],
      tags: req.tags || [],
      notebookFile: info.notebookFile || "",
      notebookPath: info.notebookPath || "",
      // Absent on records published before the field existed => "", so the
      // edit form simply shows an empty (optional) input, not an error.
      institution: req.institution || "",
    },
    referenceInfo: infoFromReferenceBlock(req.reference || {}),
    documentation: documentation.readme || "",
    charts: req.charts || [],
    tools: req.tools || [],
    datasets: req.datasets || [],
    scripts: req.scripts || [],
    heads: req.heads || [],
    workflow: {
      nodes: workflow.nodes || [],
      // Reads BOTH shapes. Reading only the array form is what would turn a
      // typed edge into two undefineds on the way back in.
      edges: (workflow.edges || []).map(fromStoredEdge),
    },
    license: req.license || "",
    workType: workTypeOf(req.work_type),
  };

  return state;
};

// Curator state -> PUT /api/paper/{id} payload for EDIT mode: the regular
// publish payload, but fields the curator does not manage are preserved from
// the original stored document (info.* extras like downloadPath/gitPath/
// isPublic, and the original schema URL). Identity/server-owned fields are
// stripped here and enforced server-side regardless.
const convertStateToUpdatePayload = (state, originalDoc, servers) => {
  const payload = convertStatetoReqSchema(state, servers);
  const original = originalDoc || {};
  const originalInfo = original.info || {};

  payload.info = { ...originalInfo, ...payload.info };
  if (!servers || !servers.downloadPath) {
    payload.info.downloadPath = originalInfo.downloadPath || "";
    payload.info.gitPath = originalInfo.gitPath || "";
  }
  if (original.schema) {
    payload.schema = original.schema;
  }

  delete payload.id;
  delete payload._id;
  delete payload.owner_email;
  delete payload.version;
  delete payload.versions;

  return payload;
};

export {
  convertViewSchemaToState,
  convertStateToViewSchema,
  convertStatetoReqSchema,
  convertReqSchematoState,
  convertStateToUpdatePayload,
};
