/**
 * search page getServerSideProps — synchronous URL parsing only.
 *
 * Record and filter data are fetched client-side after the page renders.
 * The SSR function only parses the ?servers= query param and builds friendly
 * server name labels from the shipped list (no network call).
 */
import { getServerSideProps } from "../pages/search";
import SHIPPED_SERVERS from "../data/qresp_servers";

const ctx = (servers) => ({
  query: { servers: servers ? servers.join(",") : undefined },
  req: { headers: { host: "localhost:8443" } },
});

describe("search getServerSideProps", () => {
  it("passes the servers from the query param as props", () => {
    const { props } = getServerSideProps(
      ctx(["https://paperstack.uchicago.edu", "https://qresp.hybrid3.duke.edu"])
    );
    expect(props.selectedservers).toEqual([
      "https://paperstack.uchicago.edu",
      "https://qresp.hybrid3.duke.edu",
    ]);
  });

  it("returns an empty servers list when the param is absent", () => {
    const { props } = getServerSideProps(ctx(null));
    expect(props.selectedservers).toEqual([]);
  });

  it("builds servernames from the shipped list without a network call", () => {
    const { props } = getServerSideProps(ctx(["https://paperstack.uchicago.edu"]));
    // Every shipped server with a name must appear in the map.
    for (const entry of SHIPPED_SERVERS) {
      if (entry.qresp_server_name) {
        const key = entry.qresp_server_url.replace(/\/+$/, "");
        expect(props.servernames[key]).toBe(entry.qresp_server_name);
      }
    }
  });

  it("is synchronous — no network call before the page renders", () => {
    const result = getServerSideProps(ctx(["https://paperstack.uchicago.edu"]));
    expect(result instanceof Promise).toBe(false);
    expect(result.props).toBeDefined();
  });
});

describe("this site's own records", () => {
  const { withOwnOrigin } = require("../pages/search");

  it("adds this origin first when it is not on the list", () => {
    expect(withOwnOrigin(["https://paperstack.uchicago.edu"], "https://localhost:8444")).toEqual([
      "https://localhost:8444",
      "https://paperstack.uchicago.edu",
    ]);
  });

  it("adds nothing on a node that is already listed (production)", () => {
    expect(
      withOwnOrigin(["https://paperstack.uchicago.edu/"], "https://paperstack.uchicago.edu")
    ).toEqual(["https://paperstack.uchicago.edu/"]);
  });

  it("is asked for by Explore", () => {
    const { getServerSideProps: explorer } = require("../pages/explorer");
    expect(explorer({}).redirect.destination).toMatch(/^\/search\?self=1&servers=/);
    const { props } = getServerSideProps({ query: { self: "1", servers: "https://a.edu" } });
    expect(props.includeSelf).toBe(true);
  });
});
