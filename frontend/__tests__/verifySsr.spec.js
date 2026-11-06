jest.mock("axios");
import axios from "axios";
import { render, waitFor } from "@testing-library/react";

import Verify, { getServerSideProps } from "../pages/verify/[id]";

// Staging bug: the verify page SSR fetched `${query.server}/api/verify/...`
// with query.server = https://localhost:8443 — inside the gui container that
// is the container itself (ECONNREFUSED). SSR must resolve the fetch base
// like paperdetails/search do, while the public server value stays in props.
const ctxFor = (server, host = "localhost:8443") => ({
  req: { headers: { host } },
  query: { id: "PUBLISH_abc", server },
});

describe("verify page getServerSideProps", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, QRESP_INTERNAL_API_URL: "http://backend:5000" };
    axios.get.mockResolvedValue({ data: { id: "newid123", error: "" } });
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  afterEach(() => jest.resetAllMocks());

  it("uses the internal API base for localhost staging servers", async () => {
    const result = await getServerSideProps(ctxFor("https://localhost:8443"));
    expect(axios.get).toHaveBeenCalledWith(
      "http://backend:5000/api/verify/PUBLISH_abc"
    );
    // the PUBLIC server survives untouched for user-facing links
    expect(result.props.server).toBe("https://localhost:8443");
    expect(result.props.id).toBe("newid123");
  });

  it("keeps external federation servers external", async () => {
    await getServerSideProps(
      ctxFor("https://paperstack.uchicago.edu", "localhost:8443")
    );
    expect(axios.get).toHaveBeenCalledWith(
      "https://paperstack.uchicago.edu/api/verify/PUBLISH_abc"
    );
  });

  it("fails safely without a server parameter", async () => {
    const result = await getServerSideProps({
      req: { headers: { host: "h" } },
      query: { id: "PUBLISH_abc" },
    });
    expect(axios.get).not.toHaveBeenCalled();
    expect(result.props.error).toMatch(/missing query parameter/i);
  });

  it("returns the error prop when the backend rejects the id", async () => {
    axios.get.mockRejectedValue({
      response: { data: { id: "", error: "Incorrect verify link" } },
    });
    const result = await getServerSideProps(ctxFor("https://localhost:8443"));
    expect(result.props.error).toBe("Incorrect verify link");
  });

  it("clears the browser draft only after successful verification", async () => {
    localStorage.setItem("state", JSON.stringify({ referenceInfo: { title: "Draft" } }));
    render(<Verify id="paper123" server="https://localhost:8443" error="" />);
    await waitFor(() => expect(localStorage.getItem("state")).toBeNull());
  });

  it("keeps the browser draft when verification fails", () => {
    localStorage.setItem("state", JSON.stringify({ referenceInfo: { title: "Draft" } }));
    render(
      <Verify
        id=""
        server="https://localhost:8443"
        error="Incorrect verify link"
      />
    );
    expect(localStorage.getItem("state")).not.toBeNull();
  });
});
