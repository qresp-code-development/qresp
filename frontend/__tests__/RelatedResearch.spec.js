import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

import RelatedResearch from "../components/Paper/RelatedResearch";

const internalResult = (overrides = {}) => ({
  id: "internal-1",
  title: "Rareword resonance of gadgetite thin films",
  authors: "Robin Sharedname, Casey Otherperson",
  year: 2021,
  doi: "10.1000/near",
  url: null,
  source: "internal",
  reasons: [
    "High title and abstract similarity (0.48)",
    "Shared specific keywords: rareword resonance",
    "Shared author (Robin Sharedname) on a related topic",
  ],
  ...overrides,
});

const externalResult = (overrides = {}) => ({
  id: null,
  title: "Rareword resonance in gadgetite single crystals",
  authors: "Someone Else",
  year: 2022,
  doi: "10.2000/external-a",
  url: "https://doi.org/10.2000/external-a",
  source: "external",
  reasons: ["Shares 4 specific research terms: gadgetite, rareword"],
  ...overrides,
});

const payload = (overrides = {}) => ({
  paper_id: "abc123",
  enabled: true,
  internal: { status: "ok", results: [internalResult()], count: 1 },
  external: {
    status: "ok",
    provider: "Semantic Scholar",
    results: [externalResult()],
    count: 1,
    stale: false,
    updated_at: "2026-08-01T00:00:00",
  },
  ...overrides,
});

const renderSection = (data, props = {}) => {
  if (data instanceof Error) {
    axios.get.mockRejectedValue(data);
  } else {
    axios.get.mockResolvedValue({ data });
  }
  return render(
    <RelatedResearch paperId="abc123" server="https://localhost:8443" {...props} />
  );
};

const sectionFor = async (name) => {
  const heading = await screen.findByRole("heading", { name });
  return heading.closest("div");
};

// The exact wording a reader must always see. Pinned verbatim: it is the
// only thing telling them these connections were not checked by a person.
const DISCLAIMER =
  "These suggestions are generated automatically from publication metadata " +
  "and research-similarity signals. They may be incomplete or inaccurate. " +
  "Review each paper before relying on the suggested connection.";

describe("RelatedResearch", () => {
  afterEach(() => jest.resetAllMocks());

  it("is headed Suggested Related Papers", async () => {
    renderSection(payload());
    // Wait for the settled state before asserting: the heading also renders
    // while loading, so finishing early would both prove less and leave a
    // pending fetch running into the next test.
    await screen.findByRole("heading", { name: /related qresp records/i });
    expect(screen.getByText(/suggested related papers/i)).toBeInTheDocument();
  });

  it("always shows the automatic-generation disclaimer", async () => {
    renderSection(payload());
    expect(await screen.findByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("shows the disclaimer while still loading, not only afterwards", async () => {
    let resolve;
    axios.get.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render(<RelatedResearch paperId="abc123" server="s" />);
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    resolve({ data: payload() });
    await screen.findByRole("heading", { name: /related qresp records/i });
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("keeps the disclaimer when there is nothing to show", async () => {
    renderSection(
      payload({
        internal: { status: "ok", results: [], count: 0 },
        external: {
          status: "ok",
          provider: "Semantic Scholar",
          results: [],
          count: 0,
          stale: false,
          updated_at: null,
        },
      })
    );
    expect(await screen.findByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("never claims the suggestions are AI-generated", async () => {
    // No language model runs in the serving path: candidates come from the
    // Qresp corpus and Semantic Scholar, and the ranking is arithmetic.
    // Saying "AI" here would misdescribe how the answer was produced.
    const { container } = renderSection(payload());
    await screen.findByText(DISCLAIMER);
    const text = container.textContent;
    expect(text).not.toMatch(/\bAI\b/);
    expect(text).not.toMatch(/AI-assisted/i);
    expect(text).not.toMatch(/AI recommendations/i);
    expect(text).not.toMatch(/generative/i);
    expect(text).not.toMatch(/language model/i);
    expect(text).not.toMatch(/\bGemini\b/i);
  });

  it("asks the backend for the record's related research", async () => {
    renderSection(payload());
    await screen.findByRole("heading", { name: /related qresp records/i });
    expect(axios.get).toHaveBeenCalledWith("/api/paper/abc123/related", {
      params: { server: "https://localhost:8443" },
    });
  });

  // A federated record's id exists on its own Qresp server and nowhere else.
  // Asking the local backend without saying which server holds it is the bug
  // this section had: the answer could only ever be 404.
  it("forwards the server the detail page is showing", async () => {
    axios.get.mockResolvedValue({ data: payload() });
    render(
      <RelatedResearch
        paperId="5983afce759061384c1aae48"
        server="https://paperstack.example.org"
      />
    );
    await screen.findByRole("heading", { name: /related qresp records/i });
    expect(axios.get).toHaveBeenCalledWith(
      "/api/paper/5983afce759061384c1aae48/related",
      { params: { server: "https://paperstack.example.org" } }
    );
  });

  it("sends no server parameter for a local record", async () => {
    axios.get.mockResolvedValue({ data: payload() });
    render(<RelatedResearch paperId="abc123" />);
    await screen.findByRole("heading", { name: /related qresp records/i });
    expect(axios.get).toHaveBeenCalledWith("/api/paper/abc123/related", {
      params: {},
    });
  });

  it("shows a loading state before the answer arrives", async () => {
    let resolve;
    axios.get.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render(<RelatedResearch paperId="abc123" server="s" />);
    expect(screen.getByText(/looking for related research/i)).toBeInTheDocument();
    resolve({ data: payload() });
    await screen.findByRole("heading", { name: /related qresp records/i });
    expect(
      screen.queryByText(/looking for related research/i)
    ).not.toBeInTheDocument();
  });

  it("keeps the internal and external lists separate", async () => {
    renderSection(payload());
    const internal = await sectionFor(/related qresp records/i);
    const external = await sectionFor(/related external papers/i);
    expect(
      within(internal).getByText(/gadgetite thin films/)
    ).toBeInTheDocument();
    expect(
      within(internal).queryByText(/gadgetite single crystals/)
    ).not.toBeInTheDocument();
    expect(
      within(external).getByText(/gadgetite single crystals/)
    ).toBeInTheDocument();
  });

  it("links internal results into Qresp and external results to their DOI", async () => {
    renderSection(payload());
    const internalLink = await screen.findByRole("link", {
      name: /gadgetite thin films/i,
    });
    expect(internalLink).toHaveAttribute(
      "href",
      "/paperdetails/internal-1?server=https%3A%2F%2Flocalhost%3A8443"
    );
    const externalLink = screen.getByRole("link", {
      name: /gadgetite single crystals/i,
    });
    expect(externalLink).toHaveAttribute(
      "href",
      "https://doi.org/10.2000/external-a"
    );
    expect(externalLink).toHaveAttribute("target", "_blank");
    expect(externalLink).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("shows Why related, capped at three reasons", async () => {
    renderSection(
      payload({
        internal: {
          status: "ok",
          count: 1,
          results: [
            internalResult({
              reasons: ["reason one", "reason two", "reason three", "reason four"],
            }),
          ],
        },
      })
    );
    const internal = await sectionFor(/related qresp records/i);
    expect(within(internal).getByText(/why related/i)).toBeInTheDocument();
    expect(within(internal).getByText("reason one")).toBeInTheDocument();
    expect(within(internal).getByText("reason three")).toBeInTheDocument();
    expect(within(internal).queryByText("reason four")).not.toBeInTheDocument();
  });

  it("marks external results with their provenance and internal results without it", async () => {
    renderSection(payload());
    const external = await sectionFor(/related external papers/i);
    expect(
      within(external).getByText(/recommended by semantic scholar/i)
    ).toBeInTheDocument();
    const internal = await sectionFor(/related qresp records/i);
    expect(
      within(internal).queryByText(/recommended by semantic scholar/i)
    ).not.toBeInTheDocument();
  });

  it("renders exactly the results it was given, never re-expanding a list", async () => {
    const many = (source, count) =>
      Array.from({ length: count }, (_, i) =>
        source === "internal"
          ? internalResult({ id: `i${i}`, title: `Internal record ${i}` })
          : externalResult({
              doi: `10.2000/x${i}`,
              url: `https://doi.org/10.2000/x${i}`,
              title: `External paper ${i}`,
            })
      );
    // The backend decides how many exist; the component never pads.
    renderSection(
      payload({
        internal: { status: "ok", count: 5, results: many("internal", 5) },
        external: {
          status: "ok",
          provider: "Semantic Scholar",
          stale: false,
          count: 5,
          results: many("external", 5),
          updated_at: null,
        },
      })
    );
    const internal = await sectionFor(/related qresp records/i);
    const external = await sectionFor(/related external papers/i);
    expect(within(internal).getAllByTestId("related-result")).toHaveLength(5);
    expect(within(external).getAllByTestId("related-result")).toHaveLength(5);
  });

  it("says so plainly when nothing is related enough", async () => {
    renderSection(
      payload({
        internal: { status: "ok", results: [], count: 0 },
        external: {
          status: "ok",
          provider: "Semantic Scholar",
          results: [],
          count: 0,
          stale: false,
          updated_at: null,
        },
      })
    );
    // The two lists are empty for DIFFERENT reasons and say so differently:
    // the internal one was gated, the external one simply had nothing to
    // rank. One shared sentence used to claim a judgement about both.
    expect(
      await screen.findByText("No sufficiently related papers were found.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no external recommendations are available/i)
    ).toBeInTheDocument();
  });

  it("keeps the internal list when the external provider fails", async () => {
    renderSection(
      payload({
        external: {
          status: "unavailable",
          provider: "Semantic Scholar",
          results: [],
          count: 0,
          stale: false,
          updated_at: null,
        },
      })
    );
    expect(
      await screen.findByText(/gadgetite thin films/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/external recommendations are unavailable right now/i)
    ).toBeInTheDocument();
  });

  it("flags stale external results instead of hiding them", async () => {
    renderSection(
      payload({
        external: {
          status: "unavailable",
          provider: "Semantic Scholar",
          results: [externalResult()],
          count: 1,
          stale: true,
          updated_at: "2026-07-01T00:00:00",
        },
      })
    );
    expect(
      await screen.findByText(/showing the last successful external results/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/gadgetite single crystals/)).toBeInTheDocument();
  });

  it("explains an unmatched record differently from a provider outage", async () => {
    renderSection(
      payload({
        external: {
          status: "unresolved",
          provider: "Semantic Scholar",
          results: [],
          count: 0,
          stale: false,
          updated_at: null,
        },
      })
    );
    expect(
      await screen.findByText(/could not be matched in the external index/i)
    ).toBeInTheDocument();
  });

  it("hides the external half entirely on an internal-only server", async () => {
    // The server is running with the external switch off. That is not "we
    // looked and found nothing" — the external half does not exist here, so
    // the reader is not told about a feature this deployment lacks.
    renderSection(
      payload({
        external: {
          status: "disabled",
          provider: "Semantic Scholar",
          results: [],
          count: 0,
          stale: false,
          updated_at: null,
        },
      })
    );
    // The internal list is still shown in full.
    expect(
      await screen.findByRole("heading", { name: /related qresp records/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/gadgetite thin films/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /related external papers/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/recommended by semantic scholar/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/external recommendations are turned off/i)
    ).not.toBeInTheDocument();
  });

  it("still shows the empty message for the internal list when external is off", async () => {
    renderSection(
      payload({
        internal: { status: "ok", results: [], count: 0 },
        external: {
          status: "disabled",
          provider: "Semantic Scholar",
          results: [],
          count: 0,
          stale: false,
          updated_at: null,
        },
      })
    );
    const messages = await screen.findAllByText(
      "No sufficiently related papers were found."
    );
    expect(messages).toHaveLength(1);
  });

  it("renders nothing at all when the feature is disabled server-side", async () => {
    const { container } = renderSection({
      paper_id: "abc123",
      enabled: false,
      internal: { status: "disabled", results: [], count: 0 },
      external: { status: "disabled", results: [], count: 0, stale: false },
    });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  // A failure and "nothing is related" are different facts about a record,
  // and used to look identical: both rendered as no section at all. Only one
  // of them is a statement anybody checked.
  describe("when the suggestions cannot be loaded", () => {
    const UNAVAILABLE =
      "Related research is unavailable right now. This is a problem loading " +
      "the suggestions, not a statement about this record.";

    it("keeps the section and says it is unavailable", async () => {
      renderSection(new Error("Network Error"));
      expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
      expect(
        screen.getByText(/suggested related papers/i)
      ).toBeInTheDocument();
    });

    it("does not claim that nothing is related", async () => {
      renderSection(new Error("Network Error"));
      await screen.findByText(UNAVAILABLE);
      expect(
        screen.queryByText("No sufficiently related papers were found.")
      ).not.toBeInTheDocument();
    });

    it("says the same when the backend could not reach the source server", async () => {
      // A 200 whose internal status is `unavailable`: the backend answered,
      // but the Qresp server holding the record did not.
      renderSection(
        payload({
          source_server: "https://paperstack.example.org",
          internal: { status: "unavailable", results: [], count: 0 },
          external: { status: "unavailable", results: [], count: 0 },
        })
      );
      expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
    });

    it("offers a retry that asks again", async () => {
      axios.get.mockRejectedValueOnce(new Error("Network Error"));
      axios.get.mockResolvedValue({ data: payload() });
      render(
        <RelatedResearch paperId="abc123" server="https://localhost:8443" />
      );
      await screen.findByText(UNAVAILABLE);
      expect(axios.get).toHaveBeenCalledTimes(1);

      await userEvent.click(screen.getByRole("button", { name: /try again/i }));

      await screen.findByRole("heading", { name: /related qresp records/i });
      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(UNAVAILABLE)).not.toBeInTheDocument();
    });

    it("still renders nothing when the feature is off, not an error", async () => {
      // `disabled` is an answer, not a failure: a deployment without this
      // feature must not grow an error box.
      const { container } = renderSection({
        paper_id: "abc123",
        enabled: false,
        source_server: "",
        internal: { status: "disabled", results: [], count: 0 },
        external: { status: "disabled", results: [], count: 0, stale: false },
      });
      await waitFor(() => expect(container).toBeEmptyDOMElement());
    });
  });

  // The existence contract, stated as one table. On a published detail page
  // with the feature on, this section is ALWAYS present; only an explicitly
  // disabled backend (and, at the page level, an unpublished preview) removes
  // it. Every row here is a state the first staging pass could not tell apart,
  // because all of them rendered as no section at all.
  describe("the section is always present unless explicitly disabled", () => {
    const heading = () => screen.queryByText(/suggested related papers/i);

    it("remote published record with recommendations", async () => {
      renderSection(
        payload({
          source_server: "https://paperstack.example.org",
          internal: {
            status: "ok",
            count: 1,
            results: [
              internalResult({
                id: "remote-1",
                server: "https://paperstack.example.org",
              }),
            ],
          },
        })
      );
      await screen.findByRole("heading", { name: /related qresp records/i });
      expect(heading()).toBeInTheDocument();
      expect(
        screen.getByText(/gadgetite thin films/)
      ).toBeInTheDocument();
    });

    it("remote published record with a legitimate zero result", async () => {
      renderSection(
        payload({
          source_server: "https://paperstack.example.org",
          internal: { status: "ok", count: 0, results: [] },
          external: {
            status: "ok",
            provider: "Semantic Scholar",
            count: 0,
            results: [],
            stale: false,
            updated_at: null,
          },
        })
      );
      // Both lists answered, and both are legitimately empty -- each in its
      // own words, because only one of them applies a gate.
      expect(
        await screen.findByText("No sufficiently related papers were found.")
      ).toBeInTheDocument();
      expect(
        screen.getByText(/no external recommendations are available/i)
      ).toBeInTheDocument();
      expect(heading()).toBeInTheDocument();
      expect(
        screen.queryByText(/related research is unavailable right now/i)
      ).not.toBeInTheDocument();
    });

    it("remote record not found (404)", async () => {
      const error = new Error("Request failed with status code 404");
      error.response = { status: 404 };
      renderSection(error);
      expect(
        await screen.findByText(/related research is unavailable right now/i)
      ).toBeInTheDocument();
      expect(heading()).toBeInTheDocument();
    });

    it("remote source server timed out", async () => {
      renderSection(
        payload({
          source_server: "https://paperstack.example.org",
          internal: { status: "unavailable", count: 0, results: [] },
          external: { status: "unavailable", count: 0, results: [] },
        })
      );
      expect(
        await screen.findByText(/related research is unavailable right now/i)
      ).toBeInTheDocument();
      expect(heading()).toBeInTheDocument();
    });

    it("only Semantic Scholar failed: the Qresp list survives", async () => {
      // A 429 from the external provider must not take the internal list, or
      // the section, down with it.
      renderSection(
        payload({
          internal: {
            status: "ok",
            count: 1,
            results: [internalResult()],
          },
          external: {
            status: "unavailable",
            provider: "Semantic Scholar",
            count: 0,
            results: [],
            stale: false,
            updated_at: null,
          },
        })
      );
      expect(
        await screen.findByText(/gadgetite thin films/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/external recommendations are unavailable right now/i)
      ).toBeInTheDocument();
      // NOT the whole-section failure message.
      expect(
        screen.queryByText(/related research is unavailable right now/i)
      ).not.toBeInTheDocument();
    });

    it("local record", async () => {
      renderSection(payload());
      await screen.findByRole("heading", { name: /related qresp records/i });
      expect(heading()).toBeInTheDocument();
    });

    it("master switch off: and only then does it disappear", async () => {
      const { container } = renderSection({
        paper_id: "abc123",
        enabled: false,
        source_server: "",
        internal: { status: "disabled", results: [], count: 0 },
        external: { status: "disabled", results: [], count: 0, stale: false },
      });
      await waitFor(() => expect(container).toBeEmptyDOMElement());
    });
  });

  // An ANSWER and a FAILURE read differently, and the two ways of arriving
  // at an empty answer read the same: the gate is never relaxed to fill a
  // list, so "the provider had nothing" and "nothing cleared the bar" are
  // both simply "nothing to show".
  describe("why the external list is empty", () => {
    const externalWith = (overrides) =>
      payload({
        internal: { status: "ok", count: 1, results: [internalResult()] },
        external: {
          status: "ok",
          provider: "Semantic Scholar",
          count: 0,
          results: [],
          stale: false,
          updated_at: null,
          ...overrides,
        },
      });

    // This list is never gated, so "nothing was related enough" is a claim
    // nobody made. Each empty reason gets the sentence that is actually true.
    it("says the provider returned nothing when it returned nothing", async () => {
      renderSection(
        externalWith({ reason: "provider_returned_no_candidates" })
      );
      const external = await sectionFor(/related external papers/i);
      expect(
        within(external).getByText(
          "Semantic Scholar did not return external recommendations for this paper."
        )
      ).toBeInTheDocument();
    });

    it("says something different when nothing survived validation", async () => {
      renderSection(
        externalWith({ reason: "no_valid_candidates_after_dedupe" })
      );
      const external = await sectionFor(/related external papers/i);
      expect(
        within(external).getByText(/none carried enough usable publication metadata/i)
      ).toBeInTheDocument();
      expect(
        within(external).queryByText(/unavailable right now/i)
      ).not.toBeInTheDocument();
    });

    it("never tells the reader this list was filtered for relatedness", async () => {
      // The gate's sentence belongs to the internal list alone. On an
      // ungated list it describes a judgement that was never made.
      for (const reason of [
        "provider_returned_no_candidates",
        "no_valid_candidates_after_dedupe",
        "some_reason_this_build_has_never_heard_of",
      ]) {
        const { unmount } = renderSection(externalWith({ reason }));
        const external = await sectionFor(/related external papers/i);
        expect(
          within(external).queryByText(
            "No sufficiently related papers were found."
          )
        ).not.toBeInTheDocument();
        // ...and it still says SOMETHING rather than an empty box.
        expect(external.textContent).toMatch(/no external recommendations|semantic scholar/i);
        unmount();
        jest.clearAllMocks();
      }
    });

    it("offers a retry only when asking again could change the answer", async () => {
      // A timeout may not still be true; "the provider had nothing" is an
      // answer, and re-asking returns the same nothing.
      renderSection(
        externalWith({ status: "unavailable", reason: "provider_timeout" })
      );
      const failed = await sectionFor(/related external papers/i);
      expect(
        within(failed).getByRole("button", { name: /try again/i })
      ).toBeInTheDocument();
      cleanup();
      jest.clearAllMocks();

      renderSection(
        externalWith({ reason: "provider_returned_no_candidates" })
      );
      const answered = await sectionFor(/related external papers/i);
      expect(
        within(answered).queryByRole("button", { name: /try again/i })
      ).not.toBeInTheDocument();
    });

    it("says unavailable on a rate limit, and keeps the Qresp list", async () => {
      renderSection(
        externalWith({ status: "unavailable", reason: "provider_rate_limited" })
      );
      const external = await sectionFor(/related external papers/i);
      expect(
        within(external).getByText(/external recommendations are unavailable/i)
      ).toBeInTheDocument();
      // The internal half is untouched.
      expect(screen.getByText(/gadgetite thin films/)).toBeInTheDocument();
      expect(
        screen.queryByText(/related research is unavailable right now/i)
      ).not.toBeInTheDocument();
    });

    it("says unavailable on a provider timeout", async () => {
      renderSection(
        externalWith({ status: "unavailable", reason: "provider_timeout" })
      );
      const external = await sectionFor(/related external papers/i);
      expect(
        within(external).getByText(/external recommendations are unavailable/i)
      ).toBeInTheDocument();
    });

    it("says so when this record is not in the provider's index", async () => {
      renderSection(
        externalWith({
          status: "unresolved",
          reason: "source_paper_not_in_provider_index",
        })
      );
      const external = await sectionFor(/related external papers/i);
      expect(
        within(external).getByText(/could not be matched in the external index/i)
      ).toBeInTheDocument();
    });
  });

  // A short list is shown as it is, in both sections, with no pagination and
  // nothing padded. (The external cap is 25; these are all well under it.)
  describe.each([0, 1, 2, 3])("with %i results", (count) => {
    const results = (source) =>
      Array.from({ length: count }, (unused, index) =>
        source === "internal"
          ? internalResult({
              id: `internal-${index}`,
              title: `Internal result ${index}`,
            })
          : externalResult({
              doi: `10.2000/external-${index}`,
              url: `https://doi.org/10.2000/external-${index}`,
              title: `External result ${index}`,
            })
      );

    it("renders exactly that many in each list", async () => {
      renderSection(
        payload({
          internal: { status: "ok", count, results: results("internal") },
          external: {
            status: "ok",
            provider: "Semantic Scholar",
            count,
            results: results("external"),
            stale: false,
            updated_at: null,
          },
        })
      );
      await screen.findByRole("heading", { name: /related qresp records/i });
      const rendered = screen.queryAllByTestId("related-result");
      expect(rendered).toHaveLength(count * 2);
      if (count === 0) {
        expect(
          screen.getByText("No sufficiently related papers were found.")
        ).toBeInTheDocument();
        expect(
          screen.getByText(/no external recommendations are available/i)
        ).toBeInTheDocument();
      }
    });
  });

  // Same id, different server = a different paper.
  it("refetches when only the server changes, and shows no stale answer", async () => {
    axios.get.mockResolvedValueOnce({
      data: payload({
        source_server: "https://first.example.org",
        internal: {
          status: "ok",
          count: 1,
          results: [
            internalResult({
              id: "first-1",
              title: "Answer from the first server",
              server: "https://first.example.org",
            }),
          ],
        },
      }),
    });
    const { rerender } = render(
      <RelatedResearch paperId="shared-id" server="https://first.example.org" />
    );
    expect(
      await screen.findByText("Answer from the first server")
    ).toBeInTheDocument();

    let resolveSecond;
    axios.get.mockReturnValueOnce(
      new Promise((r) => {
        resolveSecond = r;
      })
    );
    rerender(
      <RelatedResearch paperId="shared-id" server="https://second.example.org" />
    );

    // While the second server is being asked, the first server's answer must
    // be gone: it belongs to a different paper.
    expect(screen.getByText(/looking for related research/i)).toBeInTheDocument();
    expect(
      screen.queryByText("Answer from the first server")
    ).not.toBeInTheDocument();

    resolveSecond({
      data: payload({
        source_server: "https://second.example.org",
        internal: {
          status: "ok",
          count: 1,
          results: [
            internalResult({
              id: "second-1",
              title: "Answer from the second server",
              server: "https://second.example.org",
            }),
          ],
        },
      }),
    });
    expect(
      await screen.findByText("Answer from the second server")
    ).toBeInTheDocument();
    expect(axios.get).toHaveBeenNthCalledWith(2, "/api/paper/shared-id/related", {
      params: { server: "https://second.example.org" },
    });
  });

  it("refetches when only the paper changes", async () => {
    axios.get.mockResolvedValue({ data: payload() });
    const { rerender } = render(
      <RelatedResearch paperId="paper-a" server="https://localhost:8443" />
    );
    await screen.findByRole("heading", { name: /related qresp records/i });
    rerender(
      <RelatedResearch paperId="paper-b" server="https://localhost:8443" />
    );
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    expect(axios.get).toHaveBeenNthCalledWith(2, "/api/paper/paper-b/related", {
      params: { server: "https://localhost:8443" },
    });
  });

  // The external list is the only one that pages. The backend returns all
  // 0-25 in ONE response, so a page change is a slice of data already held:
  // it must never produce a request of any kind.
  describe("external pagination", () => {
    const externals = (count) =>
      Array.from({ length: count }, (unused, index) =>
        externalResult({
          doi: `10.2000/paged-${index}`,
          url: `https://doi.org/10.2000/paged-${index}`,
          title: `External paper ${index + 1}`,
        })
      );

    const paged = (count, overrides = {}) =>
      payload({
        internal: { status: "ok", count: 1, results: [internalResult()] },
        external: {
          status: "ok",
          provider: "Semantic Scholar",
          count,
          results: externals(count),
          stale: false,
          updated_at: null,
        },
        ...overrides,
      });

    const externalTitles = async () => {
      const section = await sectionFor(/related external papers/i);
      return within(section)
        .getAllByTestId("related-result")
        .map((node) => node.querySelector("a, span").textContent);
    };

    const pager = () =>
      screen.getByRole("navigation", {
        name: /related external papers pages/i,
      });

    it("shows five external results per page", async () => {
      renderSection(paged(23));
      expect(await externalTitles()).toEqual([
        "External paper 1",
        "External paper 2",
        "External paper 3",
        "External paper 4",
        "External paper 5",
      ]);
    });

    it("offers one page per five results and no more than five pages", async () => {
      renderSection(paged(23));
      await sectionFor(/related external papers/i);
      // 23 results => ceil(23 / 5) = 5 pages.
      expect(
        within(pager()).getByRole("button", { name: /go to page 5/i })
      ).toBeInTheDocument();
      expect(
        within(pager()).queryByRole("button", { name: /go to page 6/i })
      ).not.toBeInTheDocument();
    });

    it("never renders a sixth page even if the backend sends more than 25", async () => {
      // A server that has not been redeployed, or one that ever returns more
      // than it promises, must not produce a page the contract does not have.
      renderSection(paged(60));
      await sectionFor(/related external papers/i);
      expect(
        within(pager()).getByRole("button", { name: /go to page 5/i })
      ).toBeInTheDocument();
      expect(
        within(pager()).queryByRole("button", { name: /go to page 6/i })
      ).not.toBeInTheDocument();
      expect(
        screen.getByText("Showing 1-5 of 25 related external papers")
      ).toBeInTheDocument();
    });

    it("moves to the next five results and announces the range", async () => {
      renderSection(paged(23));
      await sectionFor(/related external papers/i);
      expect(
        screen.getByText("Showing 1-5 of 23 related external papers")
      ).toBeInTheDocument();

      await userEvent.click(
        within(pager()).getByRole("button", { name: /go to page 2/i })
      );

      expect(await externalTitles()).toEqual([
        "External paper 6",
        "External paper 7",
        "External paper 8",
        "External paper 9",
        "External paper 10",
      ]);
      // Found by its text, not as "the one status on the page": the feedback
      // widget below the list has a status region of its own.
      const range = screen.getByText(
        "Showing 6-10 of 23 related external papers"
      );
      expect(range).toHaveAttribute("role", "status");
      expect(range).toHaveAttribute("aria-live", "polite");
    });

    it("shows the short last page rather than five padded slots", async () => {
      renderSection(paged(23));
      await sectionFor(/related external papers/i);
      await userEvent.click(
        within(pager()).getByRole("button", { name: /go to page 5/i })
      );
      expect(await externalTitles()).toEqual([
        "External paper 21",
        "External paper 22",
        "External paper 23",
      ]);
      expect(
        screen.getByText("Showing 21-23 of 23 related external papers")
      ).toBeInTheDocument();
    });

    it("issues no request at all when a page changes", async () => {
      renderSection(paged(23));
      await sectionFor(/related external papers/i);
      expect(axios.get).toHaveBeenCalledTimes(1);

      await userEvent.click(
        within(pager()).getByRole("button", { name: /go to page 3/i })
      );
      await screen.findByText("Showing 11-15 of 23 related external papers");
      await userEvent.click(
        within(pager()).getByRole("button", { name: /go to page 1/i })
      );
      await screen.findByText("Showing 1-5 of 23 related external papers");

      // The whole list was already in the one response. Paging must not
      // re-ask this endpoint, and therefore cannot reach Semantic Scholar.
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it("announces which page is current, and is operable by keyboard alone", async () => {
      renderSection(paged(23));
      await sectionFor(/related external papers/i);
      expect(
        within(pager()).getByRole("button", { name: /^page 1$/i })
      ).toHaveAttribute("aria-current", "page");

      // Tab to the pager and activate a page with the keyboard only.
      const target = within(pager()).getByRole("button", {
        name: /go to page 2/i,
      });
      target.focus();
      expect(target).toHaveFocus();
      await userEvent.keyboard("{Enter}");

      await screen.findByText("Showing 6-10 of 23 related external papers");
      expect(
        within(pager()).getByRole("button", { name: /^page 2$/i })
      ).toHaveAttribute("aria-current", "page");
    });

    it("renders no pagination when everything fits on one page", async () => {
      renderSection(paged(5));
      const section = await sectionFor(/related external papers/i);
      expect(within(section).getAllByTestId("related-result")).toHaveLength(5);
      expect(
        screen.queryByRole("navigation", {
          name: /related external papers pages/i,
        })
      ).not.toBeInTheDocument();
      // No pager, and therefore no range announcement either: "Showing 1-5 of
      // 5" is noise when there is nowhere else to go. (The feedback widget
      // has its own status region, so this asks about the RANGE, not about
      // whether any status exists.)
      expect(
        screen.queryByText(/related external papers$/i, { selector: "p" })
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/^Showing /)).not.toBeInTheDocument();
    });

    it("does not paginate Related Qresp Records", async () => {
      renderSection(
        payload({
          internal: {
            status: "ok",
            count: 12,
            results: Array.from({ length: 12 }, (unused, index) =>
              internalResult({
                id: `internal-${index}`,
                title: `Internal record ${index}`,
              })
            ),
          },
          external: {
            status: "ok",
            provider: "Semantic Scholar",
            count: 23,
            results: externals(23),
            stale: false,
            updated_at: null,
          },
        })
      );
      const internal = await sectionFor(/related qresp records/i);
      // Every internal result the backend sent is on screen, with no control
      // to page through them. The external half pages; this one does not.
      expect(within(internal).getAllByTestId("related-result")).toHaveLength(12);
      expect(
        within(internal).queryByRole("navigation")
      ).not.toBeInTheDocument();
      expect(
        screen.getAllByRole("navigation", {
          name: /related external papers pages/i,
        })
      ).toHaveLength(1);
    });

    it("resets to page 1 when the paper changes", async () => {
      axios.get.mockResolvedValue({ data: paged(23) });
      const { rerender } = render(
        <RelatedResearch paperId="paper-a" server="https://localhost:8443" />
      );
      await sectionFor(/related external papers/i);
      await userEvent.click(
        within(pager()).getByRole("button", { name: /go to page 4/i })
      );
      await screen.findByText("Showing 16-20 of 23 related external papers");

      rerender(
        <RelatedResearch paperId="paper-b" server="https://localhost:8443" />
      );
      await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
      // Page 4 of the previous record's list says nothing about this one.
      await screen.findByText("Showing 1-5 of 23 related external papers");
    });

    it("resets to page 1 when only the source server changes", async () => {
      axios.get.mockResolvedValue({ data: paged(23) });
      const { rerender } = render(
        <RelatedResearch paperId="shared-id" server="https://first.example.org" />
      );
      await sectionFor(/related external papers/i);
      await userEvent.click(
        within(pager()).getByRole("button", { name: /go to page 3/i })
      );
      await screen.findByText("Showing 11-15 of 23 related external papers");

      rerender(
        <RelatedResearch paperId="shared-id" server="https://second.example.org" />
      );
      await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
      await screen.findByText("Showing 1-5 of 23 related external papers");
    });

    it("does not strand the reader on a page the new list does not have", async () => {
      // The failure this prevents: page 5 of a 23-result list, carried over
      // to a 6-result one, renders an EMPTY section under a heading that
      // promises results.
      axios.get
        .mockResolvedValueOnce({ data: paged(23) })
        .mockResolvedValueOnce({ data: paged(6) });
      const { rerender } = render(
        <RelatedResearch paperId="paper-a" server="https://localhost:8443" />
      );
      await sectionFor(/related external papers/i);
      await userEvent.click(
        within(pager()).getByRole("button", { name: /go to page 5/i })
      );
      await screen.findByText("Showing 21-23 of 23 related external papers");

      rerender(
        <RelatedResearch paperId="paper-b" server="https://localhost:8443" />
      );
      await screen.findByText("Showing 1-5 of 6 related external papers");
      expect(await externalTitles()).toEqual([
        "External paper 1",
        "External paper 2",
        "External paper 3",
        "External paper 4",
        "External paper 5",
      ]);
    });

    it("shows no invented relation score", async () => {
      const { container } = renderSection(paged(23));
      await sectionFor(/related external papers/i);
      expect(container.textContent).not.toMatch(/relation score/i);
      expect(container.textContent).not.toMatch(/relevance score/i);
      expect(container.textContent).not.toMatch(/\b\d{1,3}\s*% match\b/i);
    });

    // External evidence MOVED a candidate up the list; it is not the reason
    // the candidate is on the list at all -- so it gets its own heading,
    // never "Why related".
    it("heads an external result's evidence Qresp ranking signals, not Why related", async () => {
      renderSection(paged(23));
      const internal = await sectionFor(/related qresp records/i);
      const external = await sectionFor(/related external papers/i);
      expect(within(internal).getByText(/why related/i)).toBeInTheDocument();
      expect(
        within(external).getAllByText(/qresp ranking signals/i).length
      ).toBeGreaterThan(0);
      expect(within(external).queryByText(/^why related$/i)).not.toBeInTheDocument();
    });

    it("invents no explanation for an external result with no evidence", async () => {
      renderSection(
        paged(1, {
          external: {
            status: "ok",
            provider: "Semantic Scholar",
            count: 1,
            results: [externalResult({ reasons: [] })],
            stale: false,
            updated_at: null,
          },
        })
      );
      const external = await sectionFor(/related external papers/i);
      expect(
        within(external).queryByText(/qresp ranking signals/i)
      ).not.toBeInTheDocument();
      expect(within(external).queryByText(/why related/i)).not.toBeInTheDocument();
    });
  });

  // The renamed section, its once-only disclaimer, and the language it must
  // never use now that a candidate can appear with no Qresp evidence at all.
  describe("the external section's new framing", () => {
    it("is headed Related External Papers, never Recommended", async () => {
      // The list has two sources and only one of them recommends anything:
      // the citations fallback returns papers that CITE this one. A heading
      // saying "Recommended" is false for half the cases it must cover, so
      // the heading states what both sources share, and each RESULT carries
      // its own precise provenance badge.
      renderSection(payload());
      expect(
        await screen.findByRole("heading", { name: /^related external papers$/i })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: /recommended/i })
      ).not.toBeInTheDocument();
    });

    it("shows the Semantic Scholar re-ranking disclaimer exactly once", async () => {
      renderSection(payload());
      await screen.findByRole("heading", { name: /related external papers/i });
      const matches = screen.getAllByText(
        /suggestions from semantic scholar, ordered using qresp/i
      );
      expect(matches).toHaveLength(1);
    });

    it("never calls an external result verified related or gate-checked", async () => {
      const { container } = renderSection(payload());
      await screen.findByRole("heading", { name: /related external papers/i });
      expect(container.textContent).not.toMatch(/verified related/i);
      expect(container.textContent).not.toMatch(
        /shown only when qresp found evidence/i
      );
    });

    // The fallback list is not a set of recommendations, and must never be
    // labelled as one: nobody recommended these papers, they were found by
    // following citations because the recommender had nothing.
    describe("when the results came from the citations fallback", () => {
      const citing = (overrides = {}) =>
        payload({
          external: {
            status: "ok",
            provider: "Semantic Scholar",
            source_kind: "citations",
            count: 1,
            results: [externalResult({ source_kind: "citations" })],
            stale: false,
            updated_at: null,
            ...overrides,
          },
        });

      it("labels each result by what it actually is", async () => {
        renderSection(citing());
        const external = await sectionFor(/related external papers/i);
        expect(
          within(external).getByText(/cites this paper/i)
        ).toBeInTheDocument();
        expect(
          within(external).queryByText(/recommended by semantic scholar/i)
        ).not.toBeInTheDocument();
      });

      it("says why the list is citations rather than recommendations", async () => {
        renderSection(citing());
        await sectionFor(/related external papers/i);
        expect(
          screen.getByText(/had no recommendations for this paper/i)
        ).toBeInTheDocument();
      });

      it("keeps the Qresp ranking signals heading", async () => {
        renderSection(citing());
        const external = await sectionFor(/related external papers/i);
        expect(
          within(external).getByText(/qresp ranking signals/i)
        ).toBeInTheDocument();
      });

      it("falls back to the recommendation label for an older backend", async () => {
        // A backend that predates `source_kind` sends none. Its results ARE
        // recommendations, so that is what they are called.
        renderSection(payload());
        const external = await sectionFor(/related external papers/i);
        expect(
          within(external).getByText(/recommended by semantic scholar/i)
        ).toBeInTheDocument();
        expect(
          within(external).queryByText(/cites this paper/i)
        ).not.toBeInTheDocument();
      });
    });

    it("still shows the Semantic Scholar badge on every external result", async () => {
      renderSection(payload());
      const external = await sectionFor(/related external papers/i);
      expect(
        within(external).getByText(/recommended by semantic scholar/i)
      ).toBeInTheDocument();
    });
  });

  // Where a suggested record LIVES decides where its link points. A federated
  // result's id resolves only on its own server.
  describe("federated results", () => {
    const federated = (server) =>
      payload({
        source_server: server,
        internal: {
          status: "ok",
          count: 1,
          results: [internalResult({ id: "remote-1", server })],
        },
      });

    it("links a result back to the server that holds it", async () => {
      axios.get.mockResolvedValue({
        data: federated("https://paperstack.example.org"),
      });
      render(
        <RelatedResearch
          paperId="5983afce759061384c1aae48"
          server="https://paperstack.example.org"
        />
      );
      const link = await screen.findByRole("link", {
        name: /gadgetite thin films/i,
      });
      expect(link).toHaveAttribute(
        "href",
        "/paperdetails/remote-1?server=https%3A%2F%2Fpaperstack.example.org"
      );
    });

    it("falls back to the page's server when a result names none", async () => {
      // An older backend does not send `server` on a result.
      renderSection(
        payload({
          internal: {
            status: "ok",
            count: 1,
            results: [internalResult({ id: "internal-1", server: undefined })],
          },
        })
      );
      const link = await screen.findByRole("link", {
        name: /gadgetite thin films/i,
      });
      expect(link).toHaveAttribute(
        "href",
        "/paperdetails/internal-1?server=https%3A%2F%2Flocalhost%3A8443"
      );
    });
  });
});
