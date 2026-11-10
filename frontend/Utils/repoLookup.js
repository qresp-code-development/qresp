import axios from "axios";

// Fill a code repository's details from its GitHub or GitLab page.
//
// Read from the hosts' public REST APIs straight from the browser (both serve
// CORS for anonymous GETs; nothing is sent but the repository path). Like the
// DOI lookup, only what the host actually records is used and nothing is
// inferred: a contributor whose profile has no full name is left out rather
// than guessed at, and the curator reviews everything in the form.

const GITHUB = "https://api.github.com";
const GITLAB = "https://gitlab.com/api/v4";
const MAX_DEVELOPERS = 6;

/** "https://github.com/org/repo(.git)", "github.com/org/repo/tree/main",
 * "git@github.com:org/repo.git", the bare "org/repo" (taken as GitHub) or a
 * gitlab.com project path -> { host, path, url }, or null. */
export const parseRepoUrl = (text) => {
  let value = String(text || "").trim();
  if (!value) return null;
  value = value.replace(/^git@([^:]+):/, "https://$1/").replace(/\.git$/, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) value = `https://github.com/${value}`;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let parsed;
  try {
    parsed = new URL(value);
  } catch (e) {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (host === "github.com") {
    if (parts.length < 2) return null;
    const path = `${parts[0]}/${parts[1]}`;
    return { host: "github", path, url: `https://github.com/${path}` };
  }
  if (host === "gitlab.com") {
    // Project paths may be nested groups; "/-/" starts GitLab's own routes.
    const stop = parts.indexOf("-");
    const project = stop === -1 ? parts : parts.slice(0, stop);
    if (project.length < 2) return null;
    const path = project.join("/");
    return { host: "gitlab", path, url: `https://gitlab.com/${path}` };
  }
  return null;
};

// A display name only when it is a person's full name: the reference form
// needs a first and a last name for every developer.
const fullName = (name) => {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  return clean.includes(" ") ? clean : "";
};

const yearOf = (iso) => {
  const year = parseInt(String(iso || "").slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
};

const fromGitHub = async ({ path, url }) => {
  const repo = (await axios.get(`${GITHUB}/repos/${path}`)).data || {};
  // Latest release = the version being curated; otherwise the last push.
  let released = null;
  try {
    released = ((await axios.get(`${GITHUB}/repos/${path}/releases/latest`)).data || {})
      .published_at;
  } catch (e) {
    released = null;
  }
  let logins = [];
  try {
    const contributors = (
      await axios.get(`${GITHUB}/repos/${path}/contributors`, {
        params: { per_page: MAX_DEVELOPERS },
      })
    ).data;
    logins = (Array.isArray(contributors) ? contributors : [])
      .filter((c) => c && c.type !== "Bot" && c.login)
      .map((c) => c.login);
  } catch (e) {
    logins = [];
  }
  if (!logins.length && repo.owner && repo.owner.type === "User") logins = [repo.owner.login];
  const people = await Promise.all(
    logins.slice(0, MAX_DEVELOPERS).map((login) =>
      axios
        .get(`${GITHUB}/users/${login}`)
        .then((res) => fullName(res.data && res.data.name))
        .catch(() => "")
    )
  );
  return {
    title: repo.name || path.split("/").pop(),
    description: repo.description || "",
    developers: people.filter(Boolean),
    year: yearOf(released || repo.pushed_at || repo.created_at),
    url: repo.html_url || url,
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    contributorsWithoutNames: logins.length - people.filter(Boolean).length,
  };
};

const fromGitLab = async ({ path, url }) => {
  const id = encodeURIComponent(path);
  const project = (await axios.get(`${GITLAB}/projects/${id}`)).data || {};
  let names = [];
  try {
    const members = (
      await axios.get(`${GITLAB}/projects/${id}/members/all`, {
        params: { per_page: MAX_DEVELOPERS },
      })
    ).data;
    names = (Array.isArray(members) ? members : []).map((m) => fullName(m && m.name));
  } catch (e) {
    names = [];
  }
  return {
    title: project.name || path.split("/").pop(),
    description: project.description || "",
    developers: names.filter(Boolean),
    year: yearOf(project.last_activity_at || project.created_at),
    url: project.web_url || url,
    topics: Array.isArray(project.topics) ? project.topics : project.tag_list || [],
    contributorsWithoutNames: names.length - names.filter(Boolean).length,
  };
};

/** Look a repository up. Rejects with a curator-readable message. */
export const lookupRepo = async (text) => {
  const repo = parseRepoUrl(text);
  if (!repo) {
    throw new Error(
      "That does not look like a GitHub or GitLab repository link, e.g. https://github.com/org/repo"
    );
  }
  try {
    return repo.host === "github" ? await fromGitHub(repo) : await fromGitLab(repo);
  } catch (err) {
    const status = err && err.response && err.response.status;
    if (status === 404) {
      throw new Error("No public repository was found at that link. Check it, or fill in the details by hand.");
    }
    if (status === 403 || status === 429) {
      throw new Error(
        "The repository host is limiting requests right now. Try again in a few minutes, or fill in the details by hand."
      );
    }
    throw new Error("The repository could not be reached. Check the link, or fill in the details by hand.");
  }
};

/** A lookup result -> the curator's referenceInfo, keeping anything the host
 * did not supply exactly as it was. */
export const referenceFromRepo = (result, current = {}) => ({
  ...current,
  kind: "software",
  title: result.title || current.title || "",
  abstract: result.description || current.abstract || "",
  authors: result.developers.length ? result.developers.join(", ") : current.authors || "",
  year: result.year || current.year || null,
  url: result.url || current.url || "",
});
