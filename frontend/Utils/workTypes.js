// What a Qresp record curates. "paper" is a published paper -- every record
// and draft from before this list existed. The backend mirror is
// project.models.WORK_TYPES, and schema.json's work_type rules hold only a
// published paper to the journal / volume / page / at-least-one-figure
// contract.
//
// Labels here are what the curator reads in the chooser, the reference
// section and on the record; nothing below changes what is stored.
export const WORK_TYPES = {
  paper: {
    // How the curator's prose refers to it: "the paper".
    noun: "paper",
    label: "Published paper",
    short: "Paper",
    // Explore's filter: "show me only …".
    plural: "Published papers",
    description:
      "A journal article, conference paper or preprint. Link each figure to the data and code that made it.",
    heading: "Publication Information for This Paper",
    newHeading: "New Paper Submission",
    titleLabel: "Title",
    titleHelp: "Enter title of the paper",
    authorsLabel: "Authors",
    abstractLabel: "Abstract",
    abstractHelp: "Enter abstract",
    urlLabel: "URL",
    urlHelp: "Enter paper url",
    paperFields: true,
    needsFigures: true,
  },
  report: {
    // How the curator's prose refers to it: "the report".
    noun: "report",
    label: "Unpublished paper or report",
    short: "Report",
    plural: "Unpublished papers & reports",
    description:
      "A manuscript in preparation, technical report, thesis or white paper that has not been published.",
    heading: "About This Report",
    newHeading: "New Report Submission",
    titleLabel: "Title",
    titleHelp: "Title of the paper or report",
    authorsLabel: "Authors",
    abstractLabel: "Abstract",
    abstractHelp: "A summary of the work",
    venueLabel: "Institution or series",
    venueHelp: "Optional. Where it comes from, e.g. Argonne National Laboratory technical report",
    urlLabel: "URL",
    urlHelp: "Optional. Where the paper or report can be read",
  },
  software: {
    // How the curator's prose refers to it: "the code repository".
    noun: "code repository",
    label: "Code repository",
    short: "Code",
    plural: "Code repositories",
    description:
      "A GitHub or GitLab repository or other code base: what it does, who wrote it, and its scripts and tools.",
    heading: "About This Code Repository",
    newHeading: "New Code Repository",
    titleLabel: "Repository or project name",
    titleHelp: "e.g. WEST or qresp-code-development/qresp",
    authorsLabel: "Developers",
    abstractLabel: "Description",
    abstractHelp: "What the code does and what it is used for",
    urlLabel: "Repository URL",
    urlHelp: "Where the code lives, e.g. https://github.com/org/repo",
    // Required unless the code is on a file server instead (CODE_HOSTS).
    urlRequired: true,
  },
  dataset: {
    // How the curator's prose refers to it: "the dataset".
    noun: "dataset",
    label: "Dataset",
    short: "Dataset",
    plural: "Datasets",
    description:
      "A collection of data files: what they contain, how they were produced and where they live.",
    heading: "About This Dataset",
    newHeading: "New Dataset",
    titleLabel: "Dataset name",
    titleHelp: "A descriptive name for the data",
    authorsLabel: "Creators",
    abstractLabel: "Description",
    abstractHelp: "What the data contain and how they were produced",
    urlLabel: "Landing page URL",
    urlHelp: "Optional. A page describing the data, if it has one",
  },
  other: {
    // How the curator's prose refers to it: "the work".
    noun: "work",
    label: "Other",
    short: "Other",
    plural: "Other works",
    description:
      "Anything else worth making reproducible: slides, a poster, a tutorial, a simulation campaign.",
    heading: "About This Work",
    newHeading: "New Submission",
    titleLabel: "Title",
    titleHelp: "Title of the work",
    authorsLabel: "Authors",
    abstractLabel: "Description",
    abstractHelp: "What this work is",
    urlLabel: "URL",
    urlHelp: "Optional. Where the work can be found",
  },
};

export const WORK_TYPE_KEYS = Object.keys(WORK_TYPES);

// Legacy records and drafts (no work type) and anything unknown are papers.
export const workTypeOf = (value) =>
  Object.prototype.hasOwnProperty.call(WORK_TYPES, value) ? value : "paper";

export const workTypeInfo = (value) => WORK_TYPES[workTypeOf(value)];

// Where a code repository's code lives. A GitHub/GitLab repository needs its
// URL and no file server folder; code kept on the RCC file server needs the
// folder and no URL; "both" needs both. schema.json asks a code repository
// for at least one of the two. Only code records make this choice: every
// other work type keeps its project folder.
export const CODE_HOSTS = {
  repository: {
    label: "GitHub or GitLab",
    description: "A public or private Git repository.",
  },
  fileserver: {
    label: "RCC file server",
    description: "A folder on the research computing file server.",
  },
  both: {
    label: "Both",
    description: "A Git repository, plus files on the RCC file server.",
  },
};

export const CODE_HOST_KEYS = Object.keys(CODE_HOSTS);

// A code record read from its repository stores the repository, pinned to
// one commit, as its file path root (github.com/<o>/<r>/blob/<sha>), so every
// script and dataset links to the code it was curated from. That root is the
// repository, not an RCC folder.
export const isRepoFilesPath = (path) =>
  /^https:\/\/(www\.)?(github\.com|gitlab\.com)\//i.test(String(path || "").trim());

// The curator's choice, or -- for edit mode and drafts from before it was
// asked -- whatever the record already has filled in.
export const codeHostOf = ({ codeHost, referenceInfo, fileServerPath } = {}) => {
  if (Object.prototype.hasOwnProperty.call(CODE_HOSTS, codeHost)) return codeHost;
  const url = Boolean(String((referenceInfo && referenceInfo.url) || "").trim());
  const folder =
    Boolean(String(fileServerPath || "").trim()) && !isRepoFilesPath(fileServerPath);
  if (url && folder) return "both";
  return folder ? "fileserver" : "repository";
};

export const needsRepoUrl = (workType, codeHost) =>
  Boolean(workTypeInfo(workType).urlRequired) && codeHost !== "fileserver";

export const needsFolder = (workType, codeHost) =>
  workTypeOf(workType) !== "software" || codeHost !== "repository";
