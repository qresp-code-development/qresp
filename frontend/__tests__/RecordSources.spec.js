import { render, screen, within } from "@testing-library/react";

import Summary from "../components/Paper/Summary";
import { TableSearchContext } from "../components/Table/TableSearch";
import {
  buildServerNames,
  mergeRecordsByServer,
  recordIdentity,
  sourceLabel,
} from "../Utils/recordSources";

const UCHICAGO = "https://paperstack.uchicago.edu";
const DUKE = "https://qresp.hybrid3.duke.edu";

const NAMES = buildServerNames([
  { qresp_server_url: UCHICAGO, qresp_server_name: "UChicago" },
  { qresp_server_url: DUKE, qresp_server_name: "Duke" },
]);

const record = (id, overrides = {}) => ({
  _Search__id: id,
  _Search__title: `Record ${id}`,
  _Search__authors: "Robin Sharedname",
  _Search__doi: `10.1000/${id}`,
  _Search__tags: ["gadgetite"],
  _Search__publication: "Journal of Placeholder Science",
  _Search__year: 2020,
  ...overrides,
});

describe("one list across two repositories", () => {
  it("labels each record with the node that published it", () => {
    const rows = mergeRecordsByServer(
      { [UCHICAGO]: [record("a")], [DUKE]: [record("b")] },
      NAMES,
      [UCHICAGO, DUKE]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].paper._Search__sources).toEqual([
      { server: UCHICAGO, label: "UChicago" },
    ]);
    expect(rows[1].paper._Search__sources).toEqual([
      { server: DUKE, label: "Duke" },
    ]);
  });

  it("shows a record copied onto both nodes once, with both tags", () => {
    const shared = record("shared");
    const rows = mergeRecordsByServer(
      { [UCHICAGO]: [shared], [DUKE]: [{ ...shared }] },
      NAMES,
      [UCHICAGO, DUKE]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].paper._Search__sources.map((s) => s.label)).toEqual([
      "UChicago",
      "Duke",
    ]);
  });

  it("lists two records of the same paper separately, however the DOI was written", () => {
    // Two curators can each curate one paper. A new record must never hide
    // the existing one it shares a DOI with.
    const rows = mergeRecordsByServer(
      {
        [UCHICAGO]: [record("a", { _Search__doi: "10.1000/Shared" })],
        [DUKE]: [
          record("b", { _Search__doi: "https://doi.org/10.1000/shared" }),
        ],
      },
      NAMES,
      [UCHICAGO, DUKE]
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.paper._Search__id)).toEqual(["a", "b"]);
  });

  it("lists two records of the same paper on one node separately", () => {
    const rows = mergeRecordsByServer(
      {
        [UCHICAGO]: [
          record("a", { _Search__doi: "10.1000/shared", _Search__title: "Same" }),
          record("b", { _Search__doi: "10.1000/shared", _Search__title: "Same" }),
        ],
      },
      NAMES,
      [UCHICAGO]
    );
    expect(rows).toHaveLength(2);
  });

  it("never merges records that have no id", () => {
    const rows = mergeRecordsByServer(
      {
        [UCHICAGO]: [record("a", { _Search__id: "" })],
        [DUKE]: [record("b", { _Search__id: "" })],
      },
      NAMES,
      [UCHICAGO, DUKE]
    );
    expect(rows).toHaveLength(2);
    expect(recordIdentity({ _Search__id: "" })).toBe("");
  });

  it("keeps the first node's copy as the one that is linked to", () => {
    // A record's id resolves only on its own server.
    const shared = record("shared");
    const rows = mergeRecordsByServer(
      { [DUKE]: [{ ...shared }], [UCHICAGO]: [shared] },
      NAMES,
      [DUKE, UCHICAGO]
    );
    expect(rows[0].paper._Search__server).toBe(DUKE);
  });

  it("still lists a node whose records arrived but which was not ordered", () => {
    const rows = mergeRecordsByServer(
      { [UCHICAGO]: [record("a")], [DUKE]: [record("b")] },
      NAMES,
      [UCHICAGO]
    );
    expect(rows).toHaveLength(2);
  });

  it("shows the surviving node's records when the other returned none", () => {
    // A node being empty or unreachable costs its own records and nothing
    // else — /search only commits the nodes that answered.
    const rows = mergeRecordsByServer(
      { [UCHICAGO]: [record("a"), record("b")] },
      NAMES,
      [UCHICAGO, DUKE]
    );
    expect(rows).toHaveLength(2);
    rows.forEach((row) =>
      expect(row.paper._Search__sources[0].label).toBe("UChicago")
    );
  });

  it("is an empty list when no node returned anything", () => {
    expect(mergeRecordsByServer({}, NAMES, [UCHICAGO, DUKE])).toEqual([]);
  });

  it("carries the year through for sorting", () => {
    const rows = mergeRecordsByServer(
      { [UCHICAGO]: [record("a", { _Search__year: 1999 })] },
      NAMES,
      [UCHICAGO]
    );
    expect(rows[0].year).toBe(1999);
  });

  describe("labels", () => {
    it("uses the name the federation list published", () => {
      expect(sourceLabel(UCHICAGO, NAMES)).toBe("UChicago");
      expect(sourceLabel(DUKE, NAMES)).toBe("Duke");
    });

    it("falls back to the host rather than inventing a label", () => {
      // A node this deployment holds no name for is still identified — by a
      // fact, not by a guess made from the URL.
      expect(sourceLabel("https://qresp.example.org", NAMES)).toBe(
        "qresp.example.org"
      );
      expect(sourceLabel("https://qresp.example.org", {})).toBe(
        "qresp.example.org"
      );
    });

    it("ignores a trailing slash", () => {
      expect(sourceLabel(`${DUKE}/`, NAMES)).toBe("Duke");
    });

    it("has nothing to say about a missing server", () => {
      expect(sourceLabel("", NAMES)).toBe("");
    });

    // The label is INTERNAL bookkeeping now -- it identifies the node a copy
    // was read from so dedupe and the detail link work. Nothing renders it.
    it("still tracks which node a copy came from, for dedupe and routing", () => {
      const row = mergeRecordsByServer(
        {
          [DUKE]: [
            record("a", {
              _Search__authors: "Someone At Stanford",
              _Search__doi: "10.1000/uchicago-press",
              _Search__institution: "University of Chicago",
            }),
          ],
        },
        NAMES,
        [DUKE]
      )[0];
      expect(row.paper._Search__sources[0].label).toBe("Duke");
      expect(row.paper._Search__server).toBe(DUKE);
    });
  });
});

// The staging regression, at the merge step. A record published on the
// localhost node has to survive into the rows /search renders -- it was
// missing from the Explorer only because that node was never in the search
// list, not because merging dropped it.
describe("a record published on the reader's own node", () => {
  const LOCAL = "https://localhost:8443";

  it("appears in the merged rows alongside the remote corpus", () => {
    const rows = mergeRecordsByServer(
      {
        [LOCAL]: [record("local-1", { _Search__title: "test1" })],
        [UCHICAGO]: [record("remote-1", { _Search__title: "Testing" })],
      },
      NAMES,
      [LOCAL, UCHICAGO]
    );
    const titles = rows.map((row) => row.paper._Search__title);
    expect(titles).toContain("test1");
    expect(titles).toContain("Testing");
  });

  it("keeps its own node, so its detail link resolves", () => {
    // A record's id resolves only on the server that holds it.
    const rows = mergeRecordsByServer(
      { [LOCAL]: [record("local-1", { _Search__title: "test1" })] },
      NAMES,
      [LOCAL]
    );
    expect(rows[0].paper._Search__server).toBe(LOCAL);
  });

  it("leads the list when its node was searched first", () => {
    // The Explorer puts the reader's own node first, so a record just
    // published there is on the first page rather than after 65 remote ones.
    const rows = mergeRecordsByServer(
      {
        [UCHICAGO]: [record("remote-1", { _Search__title: "Testing" })],
        [LOCAL]: [record("local-1", { _Search__title: "test1" })],
      },
      NAMES,
      [LOCAL, UCHICAGO]
    );
    expect(rows[0].paper._Search__title).toBe("test1");
  });

  it("does not hide the remote record of the same paper", () => {
    // The staging report: a record published locally with the same DOI as a
    // paperstack record made the paperstack one disappear from Explore.
    const rows = mergeRecordsByServer(
      {
        [LOCAL]: [record("local-1", { _Search__doi: "10.1000/shared" })],
        [UCHICAGO]: [record("remote-1", { _Search__doi: "10.1000/shared" })],
      },
      NAMES,
      [LOCAL, UCHICAGO]
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.paper._Search__server)).toEqual([LOCAL, UCHICAGO]);
  });

});

// A Qresp node is shared federation and search infrastructure. Which node
// served a copy says nothing about who wrote the paper, so the public card
// makes exactly one institutional claim -- the curator's own -- and never
// names the node.
describe("what a record card says about institutions", () => {
  const inTable = (children) => (
    <TableSearchContext.Provider value={{ query: "", setQuery: () => {} }}>
      {children}
    </TableSearchContext.Provider>
  );

  const cardFor = (overrides, sources) =>
    render(
      inTable(
        <Summary
          rowdata={{ ...record("a", overrides), _Search__sources: sources }}
        />
      )
    );

  it("never badges the node a record was read from", () => {
    cardFor({}, [
      { server: UCHICAGO, label: "UChicago" },
      { server: DUKE, label: "Duke" },
    ]);
    expect(screen.queryByTestId("record-source")).not.toBeInTheDocument();
    expect(screen.queryByText(/hosted by/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/UChicago/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Duke/)).not.toBeInTheDocument();
  });

  it("shows the curator's Institution, said in full, beside the authors", () => {
    cardFor({ _Search__institution: "University of Chicago" }, [
      { server: DUKE, label: "Duke" },
    ]);
    const chip = screen.getByTestId("record-institution");
    // The label carries its own meaning, so a bare name can never be read as
    // something else -- and it is the curator's exact text, never abbreviated.
    expect(chip).toHaveTextContent("Institution: University of Chicago");
    // On the author row, not a line of its own below the journal.
    const authors = screen.getByText("Robin Sharedname");
    expect(authors.parentElement).toContainElement(chip);
  });

  it("shows no institution badge at all when none was entered", () => {
    cardFor({}, [{ server: DUKE, label: "Duke" }]);
    expect(screen.queryByTestId("record-institution")).not.toBeInTheDocument();
    expect(screen.queryByText(/institution/i)).not.toBeInTheDocument();
  });

  it("never derives Institution from the node that served the record", () => {
    // The card is rendered from a Duke-hosted copy and says "University of
    // Chicago", because that is what a curator typed. Nothing fills it in.
    cardFor({ _Search__institution: "University of Chicago" }, [
      { server: DUKE, label: "Duke" },
    ]);
    expect(screen.getByTestId("record-institution")).toHaveTextContent(
      "Institution: University of Chicago"
    );
  });

  it("still routes the detail link by the node that holds the record", () => {
    // The node is not shown, but it is still USED: a federated record's id
    // resolves only on its own server.
    cardFor({}, [{ server: DUKE, label: "Duke" }]);
    const link = screen.getByRole("link", { name: /Record a/i });
    expect(link.getAttribute("href")).toContain("/paperdetails/a");
  });
});
