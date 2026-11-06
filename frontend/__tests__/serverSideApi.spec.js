import {
  resolveServerSideApiBase,
  sessionHeadersFor,
} from "../Utils/serverSideApi";

const ctxWithHost = (host) => ({ req: { headers: { host } } });
const INTERNAL = "http://backend:5000";

describe("resolveServerSideApiBase", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe("with QRESP_INTERNAL_API_URL set", () => {
    beforeEach(() => {
      process.env.QRESP_INTERNAL_API_URL = INTERNAL + "/";
    });

    it("rewrites localhost staging origins to the internal backend", () => {
      expect(
        resolveServerSideApiBase(
          ctxWithHost("localhost:8443"),
          "https://localhost:8443"
        )
      ).toBe(INTERNAL);
      expect(
        resolveServerSideApiBase(ctxWithHost("x"), "http://127.0.0.1:5000")
      ).toBe(INTERNAL);
    });

    it("rewrites same-origin (request host) targets to the internal backend", () => {
      expect(
        resolveServerSideApiBase(
          ctxWithHost("paperstack.uchicago.edu"),
          "https://paperstack.uchicago.edu"
        )
      ).toBe(INTERNAL);
    });

    it("honors x-forwarded-host from the proxy", () => {
      const ctx = {
        req: {
          headers: {
            host: "gui:3000",
            "x-forwarded-host": "staging.example.org",
          },
        },
      };
      expect(
        resolveServerSideApiBase(ctx, "https://staging.example.org")
      ).toBe(INTERNAL);
    });

    it("keeps external federation nodes unchanged", () => {
      expect(
        resolveServerSideApiBase(
          ctxWithHost("localhost:8443"),
          "https://paperstack.uchicago.edu"
        )
      ).toBe("https://paperstack.uchicago.edu");
      expect(
        resolveServerSideApiBase(
          ctxWithHost("localhost:8443"),
          "https://qresp.hybrid3.duke.edu/"
        )
      ).toBe("https://qresp.hybrid3.duke.edu");
    });

    it("falls back to the internal backend when server is missing", () => {
      expect(resolveServerSideApiBase(ctxWithHost("h"), undefined)).toBe(
        INTERNAL
      );
      expect(resolveServerSideApiBase(ctxWithHost("h"), "")).toBe(INTERNAL);
    });

    it("never fetches unparseable or non-http(s) targets", () => {
      for (const evil of [
        "not a url",
        "ftp://evil.example.com",
        "javascript:alert(1)",
        "file:///etc/passwd",
        "//evil.example.com",
      ]) {
        expect(resolveServerSideApiBase(ctxWithHost("h"), evil)).toBe(
          INTERNAL
        );
      }
    });
  });

  describe("without QRESP_INTERNAL_API_URL (original behavior fallback)", () => {
    beforeEach(() => {
      delete process.env.QRESP_INTERNAL_API_URL;
    });

    it("keeps the given server for local targets", () => {
      expect(
        resolveServerSideApiBase(
          ctxWithHost("localhost:8443"),
          "https://localhost:8443"
        )
      ).toBe("https://localhost:8443");
    });

    it("keeps external servers unchanged", () => {
      expect(
        resolveServerSideApiBase(ctxWithHost("h"), "https://paperstack.uchicago.edu")
      ).toBe("https://paperstack.uchicago.edu");
    });

    it("returns null for missing or dangerous input (page error path)", () => {
      expect(resolveServerSideApiBase(ctxWithHost("h"), undefined)).toBeNull();
      expect(
        resolveServerSideApiBase(ctxWithHost("h"), "javascript:alert(1)")
      ).toBeNull();
    });
  });
});

describe("sessionHeadersFor", () => {
  const ctx = (host, cookie) => ({ req: { headers: { host, cookie } } });

  it("forwards the session cookie to this deployment's own backend", () => {
    expect(
      sessionHeadersFor(ctx("qresp.example.org", "session=s1"), "https://qresp.example.org")
    ).toEqual({ cookie: "session=s1" });
    expect(
      sessionHeadersFor(ctx("x", "session=s1"), "https://localhost:8444")
    ).toEqual({ cookie: "session=s1" });
    expect(sessionHeadersFor(ctx("x", "session=s1"), "")).toEqual({
      cookie: "session=s1",
    });
  });

  it("never sends the cookie to an external federation node", () => {
    expect(
      sessionHeadersFor(ctx("qresp.example.org", "session=s1"), "https://paperstack.uchicago.edu")
    ).toEqual({});
  });

  it("sends nothing when the reader has no cookie", () => {
    expect(sessionHeadersFor(ctx("x", undefined), "https://localhost")).toEqual({});
  });
});
