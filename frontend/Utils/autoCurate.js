// Pure helpers behind the Curator's guided setup: profile -> curator details,
// Crossref record -> referenceInfo, and a folder analysis -> one importable
// bundle of records and links. No React and no network here.

import { toDraft, toRecord, missingRequired, missingRecommended } from "./artifactFields";
import { doiUtil } from "./doi";
import { namesUtil, referenceUtil } from "./utils";

export const LISTS = [
  { key: "charts", type: "chart", noun: "figure", plural: "figures" },
  { key: "datasets", type: "dataset", noun: "dataset", plural: "datasets" },
  { key: "scripts", type: "script", noun: "script", plural: "scripts" },
  { key: "tools", type: "tool", noun: "tool", plural: "tools" },
];

const text = (value) => (typeof value === "string" ? value.trim() : "");

// ---- curator ----------------------------------------------------------------

export const curatorFromProfile = (user) => {
  if (!user) return null;
  const parts = text(user.name).split(/\s+/).filter(Boolean);
  const nameLooksLikeEmail = parts.length === 1 && parts[0].includes("@");
  const names = nameLooksLikeEmail ? [] : parts;
  return {
    firstName: names[0] || "",
    middleName: names.length > 2 ? names.slice(1, -1).join(" ") : "",
    lastName: names.length > 1 ? names[names.length - 1] : "",
    emailId: text(user.email),
    affiliation: text(user.affiliation),
  };
};

export const curatorIsBlank = (info) =>
  !info || !["firstName", "lastName", "emailId", "affiliation"].some((k) => text(info[k]));

export const curatorIsComplete = (info) =>
  Boolean(info && text(info.firstName) && text(info.lastName) && text(info.emailId));

// ---- reference ----------------------------------------------------------------

const KIND_BY_CROSSREF_TYPE = {
  "journal-article": "journal",
  "proceedings-article": "journal",
  "book-chapter": "journal",
  "posted-content": "preprint",
  dissertation: "dissertation",
};

// The same shape ReferenceInfoForm saves, built from a Crossref record.
export const referenceFromCrossref = (record, previous = {}) => {
  const values = {};
  doiUtil.set(record, (field, value) => {
    values[field] = value;
  });
  const hasPublication = ["journal", "year", "volume", "page"].some((key) =>
    String(values[key] || "").trim()
  );
  let authors = previous.authors || "";
  if (Array.isArray(values.authors)) {
    try {
      authors = namesUtil.set(values.authors);
    } catch (e) {
      // A malformed author list keeps whatever the form already had.
    }
  }
  return {
    ...previous,
    kind:
      previous.kind ||
      values.kind ||
      KIND_BY_CROSSREF_TYPE[(record || {}).type] ||
      "journal",
    doi: doiUtil.normalize(values.doi || previous.doi || ""),
    title: values.title || previous.title || "",
    authors,
    publication: hasPublication
      ? referenceUtil.set({
          journal: values.journal || "",
          year: values.year || "",
          volume: values.volume || "",
          page: values.page || "",
        })
      : previous.publication || "",
    year: values.year ? Number(values.year) || values.year : previous.year || null,
    url: values.url || previous.url || "",
    abstract: values.abstract || previous.abstract || "",
  };
};

// ---- folder analysis -> bundle --------------------------------------------------

const keyFor = (candidate) => `cand:${candidate.id}`;

const existingPaths = (state, list) => {
  const seen = new Set();
  (state[list] || []).forEach((record) => {
    if (record.imageFile) seen.add(String(record.imageFile).replace(/^\/+/, ""));
    (record.files || []).forEach((file) => seen.add(String(file).replace(/^\/+/, "")));
  });
  return seen;
};

const candidatePath = (candidate) => {
  const proposal = candidate.proposal || {};
  return String(proposal.imageFile || (proposal.files || [])[0] || "").replace(/^\/+/, "");
};

/**
 * Everything one click would add, with defaults applied:
 * - figure numbers from the server's file-name suggestions;
 * - figure keywords defaulting to the paper's tags, when it has any.
 *
 * Returns { items: [{key, list, type, candidate, value, missing, duplicate}],
 *           links: [{from, to, type, reason, confidence}] }.
 */
export const buildImportPlan = (analysis, { state = {}, paperTags = [] } = {}) => {
  const candidates = (analysis && analysis.candidates) || {};
  const suggestions = (analysis && analysis.suggestions) || {};
  const numbers = suggestions.numbers || {};
  const tags = (paperTags || []).map(text).filter(Boolean);

  const items = [];
  LISTS.forEach(({ key: list, type }) => {
    const seen = existingPaths(state, list);
    (candidates[list] || []).forEach((candidate) => {
      if (!candidate || !candidate.id) return;
      const draft = toDraft(type, candidate.proposal || {});
      if (type === "chart") {
        if (!text(draft.number) && numbers[candidate.id]) draft.number = numbers[candidate.id];
        if (!text(draft.properties) && tags.length) draft.properties = tags.join(", ");
      }
      items.push({
        key: keyFor(candidate),
        list,
        type,
        candidate,
        label: candidate.label || candidatePath(candidate),
        value: toRecord(type, draft),
        missing: missingRequired(type, draft),
        duplicate: seen.has(candidatePath(candidate)),
      });
    });
  });

  const known = new Set(items.map((item) => item.key));
  const links = (suggestions.links || [])
    .map((link) => ({
      ...link,
      from: `cand:${link.from}`,
      to: `cand:${link.to}`,
    }))
    .filter((link) => known.has(link.from) && known.has(link.to));

  return { items, links };
};

// Candidates the analysis lists but does not propose (a repository image no
// script writes, a script that writes no figure): unticked until chosen.
export const unselectedKeys = (analysis) => {
  const keys = {};
  const candidates = (analysis && analysis.candidates) || {};
  LISTS.forEach(({ key: list }) => {
    (candidates[list] || []).forEach((candidate) => {
      if (candidate && candidate.id && candidate.selected === false) keys[keyFor(candidate)] = true;
    });
  });
  return keys;
};

export const countByList = (items) => {
  const counts = {};
  LISTS.forEach(({ key }) => {
    counts[key] = 0;
  });
  items.forEach((item) => {
    counts[item.list] = (counts[item.list] || 0) + 1;
  });
  return counts;
};

// The required fields still empty on records already in the form.
// `recommended` also lists optional-but-recommended fields still empty (a
// figure's caption, a resource's description), for surfaces that offer them.
export const recordsNeedingDetails = (state, { recommended = false } = {}) => {
  const out = [];
  LISTS.forEach(({ key: list, type }) => {
    (state[list] || []).forEach((record) => {
      // Experiment tools have their own required fields, checked by the form.
      if (type === "tool" && record.kind && record.kind !== "software") return;
      const draft = toDraft(type, record);
      const missing = recommended ? missingRecommended(type, draft) : missingRequired(type, draft);
      if (missing.length) out.push({ list, type, record, missing });
    });
  });
  return out;
};
