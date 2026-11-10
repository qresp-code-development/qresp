/**
 * Explorer is a pure server-side redirect to /search.
 *
 * The old SSR fetched the federation list from /api/federation/servers before
 * sending any HTML, blocking for up to 16 seconds on every page open. It has
 * been replaced with a synchronous redirect using the shipped server list so
 * the browser gets a response immediately.
 */
import { getServerSideProps } from "../pages/explorer";
import SHIPPED_SERVERS from "../data/qresp_servers";

const serversIn = (result) =>
  decodeURIComponent(result.redirect.destination.split("servers=")[1]).split(",");

describe("explorer getServerSideProps", () => {
  it("redirects to /search with the shipped servers", () => {
    const result = getServerSideProps({});
    expect(result.redirect).toBeDefined();
    expect(result.redirect.permanent).toBe(false);
    const servers = serversIn(result);
    expect(servers).toEqual(SHIPPED_SERVERS.map((s) => s.qresp_server_url));
  });

  it("uses the shipped list order", () => {
    const [first] = serversIn(getServerSideProps({}));
    expect(first).toBe(SHIPPED_SERVERS[0].qresp_server_url);
  });

  it("makes no network call — the redirect is synchronous", () => {
    // getServerSideProps is not async; it returns a plain object.
    const result = getServerSideProps({});
    expect(result instanceof Promise).toBe(false);
    expect(result.redirect).toBeDefined();
  });

  it("hardcodes no server URL and no record count", () => {
    const source = require("fs").readFileSync(
      require("path").join(__dirname, "..", "pages", "explorer.js"),
      "utf8"
    );
    expect(source).not.toMatch(/paperstack\.uchicago\.edu/i);
    expect(source).not.toMatch(/duke\.edu/i);
    expect(source).not.toMatch(/\b65\b/);
  });
});
