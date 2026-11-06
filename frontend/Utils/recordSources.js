// Where a record came from, for a list that mixes several Qresp nodes.
//
// The Explorer opens on EVERY federated node, so one list can hold a record
// from one node beside a record from another — and one record can be copied
// onto both. The job here is to show that record ONCE, and to keep track of
// which node each copy came from so its detail link resolves. Different
// records of the same paper are all listed.
//
// The node is NOT shown to a reader. A Qresp node is shared federation and
// search infrastructure; which one served a copy says nothing about who wrote
// the paper or where the work was done, and a badge naming the operating
// institution invited exactly that misreading. `sourceLabel` survives for
// internal use and for operator-facing diagnostics.
//
// What is derived here is never guessed. A label comes from
// `qresp_server_name` in the federation list (`/api/federation/servers`,
// which the backend builds from the same entries it enforces `?server=`
// against); deriving a name from a hostname would be a regex that breaks the
// moment a node is renamed or two nodes share a domain. A node with no name
// published falls back to its HOST, which is still true.

const trimOrigin = (value) =>
  typeof value === "string" ? value.replace(/\/+$/, "") : "";

/**
 * origin -> short label, from whatever the federation endpoint published.
 * Servers without a name are simply absent; `sourceLabel` handles that.
 */
export const buildServerNames = (servers) => {
  const names = {};
  (Array.isArray(servers) ? servers : []).forEach((entry) => {
    const origin = trimOrigin((entry || {}).qresp_server_url);
    const name = String((entry || {}).qresp_server_name || "").trim();
    if (origin && name) names[origin] = name;
  });
  return names;
};

/**
 * A node's short name, for internal bookkeeping and operator diagnostics --
 * NOT for display on a public record card. Falls back to the node's HOST — a
 * fact — and finally to the raw string, so it is never blank or invented.
 */
export const sourceLabel = (server, names) => {
  const origin = trimOrigin(server);
  if (!origin) return "";
  const published = (names || {})[origin];
  if (published) return published;
  try {
    return new URL(origin).host;
  } catch (e) {
    return origin;
  }
};

/**
 * The identity two nodes' copies of ONE RECORD share.
 *
 * The record's id only -- never its DOI or title. Two curators can each
 * curate the same paper, and those are two records that must both be listed:
 * folding them together on the DOI made a newly published record hide the
 * one it shared a paper with. An id is minted once, when a record is first
 * stored, so the same id on two nodes is a copy of one record, which is the
 * only thing it is safe to show once.
 */
export const recordIdentity = (paper) => {
  const id = String((paper || {})._Search__id || "").trim();
  return id ? `id:${id}` : "";
};

/**
 * {server: [record]} -> one flat, de-duplicated list of table rows.
 *
 * Each row's paper carries `_Search__sources`: every node that publishes it,
 * in the order the nodes were searched, each with its origin and its label.
 * That is what makes a record copied onto two nodes ONE row instead of two;
 * it is bookkeeping, and none of it is rendered.
 *
 * The first node to publish a record wins the fields that are rendered (title,
 * authors, tags) and the link target, so a duplicate cannot silently change
 * what a row says. The order of `servers` decides "first", and that order is
 * the deployment's own: `/explorer` puts `default_server` in front.
 */
export const mergeRecordsByServer = (papersByServer, names, serverOrder) => {
  const papers = papersByServer || {};
  const order =
    Array.isArray(serverOrder) && serverOrder.length
      ? serverOrder.filter((server) => server in papers)
      : Object.keys(papers);
  // A node present in the data but not named in the order must not vanish.
  Object.keys(papers).forEach((server) => {
    if (!order.includes(server)) order.push(server);
  });

  const rows = [];
  const byIdentity = new Map();

  order.forEach((server) => {
    const label = sourceLabel(server, names);
    (papers[server] || []).forEach((paper) => {
      const source = { server, label };
      const identity = recordIdentity(paper);
      const seen = identity ? byIdentity.get(identity) : undefined;
      if (seen) {
        // Same record, another node. One row, and no duplicate entry if a
        // node somehow lists the record twice.
        if (!seen.paper._Search__sources.some((s) => s.server === server)) {
          seen.paper._Search__sources.push(source);
        }
        return;
      }
      // `_Search__server` stays the node this copy was read from: it is what
      // the detail-page link carries, and a record's id only resolves on its
      // own server.
      const merged = { ...paper, _Search__server: server, _Search__sources: [source] };
      const row = {
        paper: merged,
        year: merged._Search__year,
        author: merged._Search__authors,
        journal: merged._Search__publication,
      };
      rows.push(row);
      if (identity) byIdentity.set(identity, row);
    });
  });

  return rows;
};
