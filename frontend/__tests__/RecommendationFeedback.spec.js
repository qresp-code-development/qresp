import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("axios");
import axios from "axios";

import RelatedResearch from "../components/Paper/RelatedResearch";
import RecommendationFeedback from "../components/Paper/RecommendationFeedback";
import AuthContext from "../Context/Auth/authContext";

// The rating widget requires an ACCOUNT and a signed context.
//
// Anonymous rating was keyed by a per-session token a reader could reset, so
// "one opinion per reader" was false; and the server now refuses any rating
// that does not come with the note it minted alongside the list. Both show up
// here as things the component must not do.

const CONTEXT = "ctx-body.ctx-signature";

const externalResult = (index) => ({
  id: null,
  title: `External paper ${index}`,
  authors: "Someone Else",
  year: 2022,
  doi: `10.2000/x${index}`,
  url: `https://doi.org/10.2000/x${index}`,
  source: "external",
  reasons: ["Shares 3 specific research terms: gadgetite"],
});

const payload = (externalCount, { context = CONTEXT } = {}) => ({
  paper_id: "abc123",
  enabled: true,
  internal: { status: "ok", results: [], count: 0 },
  external: {
    status: "ok",
    provider: "Semantic Scholar",
    count: externalCount,
    results: Array.from({ length: externalCount }, (unused, index) =>
      externalResult(index + 1)
    ),
    stale: false,
    updated_at: null,
    ...(context ? { feedback_context: context } : {}),
  },
});

const auth = (authenticated, loading = false) => ({
  authenticated,
  loading,
  user: authenticated ? { email: "reader@example.org" } : null,
  logout: () => {},
});

// The related-research GET and the "my rating" GET share one axios mock, so
// they are routed by URL rather than by call order.
const routeGets = ({ related, mine = {} }) => {
  axios.get.mockImplementation((url) => {
    if (String(url).endsWith("/related/feedback")) {
      return Promise.resolve({ data: { rating: null, reasons: [], comment: "", ...mine } });
    }
    return Promise.resolve({ data: related });
  });
};

const renderSection = (
  externalCount,
  { authenticated = true, mine = {}, context = CONTEXT } = {}
) => {
  routeGets({ related: payload(externalCount, { context }), mine });
  axios.post.mockResolvedValue({ data: { saved: true } });
  return render(
    <AuthContext.Provider value={auth(authenticated)}>
      <RelatedResearch paperId="abc123" server="https://localhost:8443" />
    </AuthContext.Provider>
  );
};

const widget = async () => await screen.findByTestId("recommendation-feedback");
const rating = (value) => screen.getByTestId(`feedback-rating-${value}`);

describe("recommendation feedback", () => {
  afterEach(() => jest.resetAllMocks());

  // The block asks the reader for something, which makes it a different kind
  // of thing from the list above it. Without a rule and real space it read as
  // a sixth search result.
  describe("how it sits under the results", () => {
    const styleOf = (node) => window.getComputedStyle(node);

    it("is separated from the results by a rule and real space", async () => {
      renderSection(3);
      const block = await screen.findByTestId("recommendation-feedback");
      const style = styleOf(block);
      expect(style.borderTopStyle).toBe("solid");
      expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
      expect(parseFloat(style.paddingTop)).toBeGreaterThanOrEqual(16);
      expect(parseFloat(style.marginTop)).toBeGreaterThanOrEqual(24);
    });

    it("is centered at a readable width", async () => {
      renderSection(3);
      const style = styleOf(await screen.findByTestId("recommendation-feedback"));
      expect(style.marginLeft).toBe("auto");
      expect(style.marginRight).toBe("auto");
      expect(parseFloat(style.maxWidth)).toBeLessThanOrEqual(560);
      expect(parseFloat(style.maxWidth)).toBeGreaterThan(0);
    });

    it("spaces its parts with ONE rule, not a different margin each", async () => {
      // Rating group, reasons, comment, button and status are siblings in a
      // flex column with a single gap. That is what stopped the gaps looking
      // arbitrary, and it is what keeps them from colliding on a phone.
      const user = userEvent.setup();
      renderSection(3);
      const block = await screen.findByTestId("recommendation-feedback");
      const style = styleOf(block);
      expect(style.display).toBe("flex");
      expect(style.flexDirection).toBe("column");
      expect(parseFloat(style.gap)).toBeGreaterThan(0);

      // With a low rating every optional part is on screen at once; none of
      // them carries its own top margin to fight the gap.
      await user.click(screen.getByTestId("feedback-rating-1"));
      const reasons = await screen.findByTestId("feedback-reasons");
      expect(parseFloat(styleOf(reasons).marginTop) || 0).toBe(0);
    });

    it("keeps the signed-out prompt in the same frame", async () => {
      // The two states must not shift the page under a reader who signs in.
      renderSection(3, { authenticated: false });
      const block = await screen.findByTestId("recommendation-feedback-signin");
      const style = styleOf(block);
      expect(style.borderTopStyle).toBe("solid");
      expect(style.marginLeft).toBe("auto");
      expect(style.marginRight).toBe("auto");
    });
  });

  describe("signed in", () => {
    it("asks whether the recommendations were helpful", async () => {
      renderSection(3);
      const box = await widget();
      expect(
        within(box).getByText("Were these recommendations helpful?")
      ).toBeInTheDocument();
    });

    it("offers the whole 1-5 scale with its meaning spelled out", async () => {
      renderSection(3);
      await widget();
      expect(
        screen.getByRole("button", { name: /^1: Very dissatisfied$/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^3: Neutral$/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^5: Very satisfied$/ })
      ).toBeInTheDocument();
      // 2 and 4 are named by where they sit rather than by an invented word.
      expect(
        screen.getByRole("button", { name: /^2: between very dissatisfied/ })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^4: between neutral/ })
      ).toBeInTheDocument();
    });

    it("sends the signed context with the rating, and no result count", async () => {
      renderSection(23);
      await widget();
      await userEvent.click(rating(4));
      await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
      const [url, body] = axios.post.mock.calls[0];
      expect(url).toBe("/api/paper/abc123/related/feedback");
      expect(body.feedback_context).toBe(CONTEXT);
      expect(body.rating).toBe(4);
      // How many results there were is the SERVER's fact now. The component
      // does not send one, so it cannot get one wrong or lie about it.
      expect(body).not.toHaveProperty("results_shown");
      expect(Object.keys(body).sort()).toEqual([
        "comment",
        "feedback_context",
        "page_at_submit",
        "pages_viewed",
        "rating",
        "reasons",
        "source",
      ]);
    });

    it("relies on the project's own CSRF interceptor for the header", async () => {
      // The global axios request interceptor (Context/Auth/AuthState) adds
      // X-CSRF-Token to every same-origin mutation, so the component posts to
      // a RELATIVE url and adds no header of its own -- one place to get it
      // right instead of one per caller.
      renderSection(3);
      await widget();
      await userEvent.click(rating(4));
      await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
      const [url, , config] = axios.post.mock.calls[0];
      expect(url.startsWith("/")).toBe(true);
      expect((config && config.headers) || {}).toEqual({});
    });

    it("restores this reader's previous rating on first render", async () => {
      renderSection(3, {
        mine: { rating: 2, reasons: ["need_more_variety"], comment: "too broad" },
      });
      await widget();
      await waitFor(() =>
        expect(rating(2)).toHaveAttribute("aria-pressed", "true")
      );
      expect(
        screen.getByLabelText("I need more variety")
      ).toBeChecked();
      expect(screen.getByLabelText(/anything else/i)).toHaveValue("too broad");
    });

    it("asks only for its own rating, for this record and list", async () => {
      renderSection(3);
      await widget();
      const call = axios.get.mock.calls.find(([url]) =>
        String(url).endsWith("/related/feedback")
      );
      expect(call[0]).toBe("/api/paper/abc123/related/feedback");
      expect(call[1].params).toEqual({
        source: "external",
        server: "https://localhost:8443",
      });
    });

    it("announces that it is loading the previous rating", async () => {
      let resolveMine;
      axios.get.mockImplementation((url) => {
        if (String(url).endsWith("/related/feedback")) {
          return new Promise((resolve) => {
            resolveMine = resolve;
          });
        }
        return Promise.resolve({ data: payload(3) });
      });
      render(
        <AuthContext.Provider value={auth(true)}>
          <RelatedResearch paperId="abc123" server="s" />
        </AuthContext.Provider>
      );
      await widget();
      expect(await screen.findByRole("status")).toHaveTextContent(
        /loading your previous rating/i
      );
      resolveMine({ data: { rating: null, reasons: [], comment: "" } });
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent("")
      );
    });

    it("shows an empty scale when this reader has not rated yet", async () => {
      renderSection(3, { mine: { rating: null } });
      await widget();
      await waitFor(() => expect(axios.get).toHaveBeenCalled());
      [1, 2, 3, 4, 5].forEach((value) =>
        expect(rating(value)).toHaveAttribute("aria-pressed", "false")
      );
    });

    it("does not turn a failed restore into an error message", async () => {
      axios.get.mockImplementation((url) =>
        String(url).endsWith("/related/feedback")
          ? Promise.reject(new Error("nope"))
          : Promise.resolve({ data: payload(3) })
      );
      render(
        <AuthContext.Provider value={auth(true)}>
          <RelatedResearch paperId="abc123" server="s" />
        </AuthContext.Provider>
      );
      await widget();
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent("")
      );
    });

    it("announces that the rating was saved", async () => {
      renderSection(3);
      await widget();
      await userEvent.click(rating(5));
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          /your rating was saved/i
        )
      );
    });

    it("says so when the rating could not be saved", async () => {
      renderSection(3);
      axios.post.mockRejectedValue({ response: { status: 500 } });
      await widget();
      await userEvent.click(rating(2));
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          /could not be saved/i
        )
      );
    });

    it("tells the reader to reload when the context has expired", async () => {
      // 410 is not the reader's mistake and "try again" would not help.
      renderSection(3);
      axios.post.mockRejectedValue({ response: { status: 410 } });
      await widget();
      await userEvent.click(rating(3));
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(/reload it/i)
      );
    });

    it("marks the chosen rating as selected", async () => {
      renderSection(3);
      await widget();
      await userEvent.click(rating(2));
      expect(rating(2)).toHaveAttribute("aria-pressed", "true");
      expect(rating(5)).toHaveAttribute("aria-pressed", "false");
    });

    it("lets the reader change their mind later", async () => {
      renderSection(3);
      await widget();
      await userEvent.click(rating(1));
      await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
      await userEvent.click(rating(5));
      await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
      expect(axios.post.mock.calls[1][1].rating).toBe(5);
      expect(rating(5)).toHaveAttribute("aria-pressed", "true");
    });

    it("does not withdraw a rating when it is clicked again", async () => {
      renderSection(3);
      await widget();
      await userEvent.click(rating(3));
      await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
      await userEvent.click(rating(3));
      expect(rating(3)).toHaveAttribute("aria-pressed", "true");
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it("is operable with the keyboard alone", async () => {
      renderSection(3);
      await widget();
      const target = rating(4);
      target.focus();
      expect(target).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
      expect(axios.post.mock.calls[0][1].rating).toBe(4);
    });

    it("reports the page the reader was on and how deep they went", async () => {
      renderSection(23);
      await widget();
      const pager = screen.getByRole("navigation", {
        name: /related external papers pages/i,
      });
      await userEvent.click(
        within(pager).getByRole("button", { name: /go to page 3/i })
      );
      await userEvent.click(rating(2));
      await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
      const body = axios.post.mock.calls[0][1];
      expect(body.page_at_submit).toBe(3);
      expect(body.pages_viewed).toBe(3);
    });

    it("groups the heading, scale and anchor caption into one centered block", async () => {
      renderSection(3);
      const heading = (await widget()).querySelector(
        "#recommendation-feedback-heading"
      );
      const group = screen.getByRole("group");
      const caption = screen.getByText(
        "1: Very dissatisfied · 3: Neutral · 5: Very satisfied"
      );
      // One compact group: all three share the same immediate parent.
      expect(heading.parentElement).toBe(group.parentElement);
      expect(caption.parentElement).toBe(group.parentElement);
    });

    it("keeps the reasons, comment and send button outside the centered group", async () => {
      renderSection(3);
      const box = await widget();
      await userEvent.click(rating(2));
      const group = screen.getByRole("group");
      const centeredGroup = group.parentElement;
      const reasons = within(box).getByTestId("feedback-reasons");
      const sendButton = screen.getByRole("button", { name: /send feedback/i });
      expect(centeredGroup.contains(reasons)).toBe(false);
      expect(centeredGroup.contains(sendButton)).toBe(false);
    });

    it("forwards the source server for a federated record", async () => {
      routeGets({ related: payload(3) });
      axios.post.mockResolvedValue({ data: { saved: true } });
      render(
        <AuthContext.Provider value={auth(true)}>
          <RelatedResearch paperId="abc123" server="https://peer.example.org" />
        </AuthContext.Provider>
      );
      await widget();
      await userEvent.click(rating(4));
      await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
      expect(axios.post.mock.calls[0][2]).toEqual({
        params: { server: "https://peer.example.org" },
      });
    });
  });

  describe("a low rating", () => {
    it.each([1, 2])("offers reasons for %i", async (value) => {
      renderSection(3);
      await widget();
      await userEvent.click(rating(value));
      const reasons = await screen.findByTestId("feedback-reasons");
      [
        "Too many unrelated papers",
        "Not in my research area",
        "I already knew these papers",
        "I need more variety",
        "Other",
      ].forEach((label) =>
        expect(within(reasons).getByText(label)).toBeInTheDocument()
      );
    });

    it.each([3, 4, 5])("offers no reasons for %i", async (value) => {
      renderSection(3);
      await widget();
      await userEvent.click(rating(value));
      expect(screen.queryByTestId("feedback-reasons")).not.toBeInTheDocument();
    });

    it("does not require a reason", async () => {
      renderSection(3);
      await widget();
      await userEvent.click(rating(1));
      await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
      expect(axios.post.mock.calls[0][1].reasons).toEqual([]);
    });

    it("sends the reasons and the optional comment", async () => {
      renderSection(3);
      await widget();
      await userEvent.click(rating(1));
      await userEvent.click(screen.getByLabelText("Not in my research area"));
      await userEvent.type(
        screen.getByLabelText(/anything else/i),
        "wrong field"
      );
      await userEvent.click(
        screen.getByRole("button", { name: /send feedback/i })
      );
      await waitFor(() =>
        expect(axios.post.mock.calls.length).toBeGreaterThan(1)
      );
      const body = axios.post.mock.calls[axios.post.mock.calls.length - 1][1];
      expect(body.reasons).toEqual(["not_my_research_area"]);
      expect(body.comment).toBe("wrong field");
    });

    it("drops reasons when a restored low rating is corrected upward", async () => {
      // In the UI and in the request, so the database loses them too.
      renderSection(3, { mine: { rating: 2, reasons: ["already_knew_these"] } });
      await widget();
      await waitFor(() =>
        expect(rating(2)).toHaveAttribute("aria-pressed", "true")
      );
      expect(screen.getByTestId("feedback-reasons")).toBeInTheDocument();

      await userEvent.click(rating(5));
      await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
      expect(axios.post.mock.calls[0][1].reasons).toEqual([]);
      expect(screen.queryByTestId("feedback-reasons")).not.toBeInTheDocument();
    });
  });

  describe("not signed in", () => {
    it("shows a sign-in prompt instead of the scale", async () => {
      renderSection(3, { authenticated: false });
      const prompt = await screen.findByTestId(
        "recommendation-feedback-signin"
      );
      expect(
        within(prompt).getByText(/sign in to rate these recommendations/i)
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("recommendation-feedback")
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId("feedback-rating-1")).not.toBeInTheDocument();
    });

    it("links to the project's own sign-in entry point", async () => {
      renderSection(3, { authenticated: false });
      const link = await screen.findByTestId("feedback-signin-link");
      expect(link.getAttribute("href")).toMatch(/^\/login/);
    });

    it("posts nothing and asks for nobody's rating", async () => {
      renderSection(3, { authenticated: false });
      await screen.findByTestId("recommendation-feedback-signin");
      expect(axios.post).not.toHaveBeenCalled();
      expect(
        axios.get.mock.calls.filter(([url]) =>
          String(url).endsWith("/related/feedback")
        )
      ).toHaveLength(0);
    });

    it("shows no error, because nothing failed", async () => {
      renderSection(3, { authenticated: false });
      await screen.findByTestId("recommendation-feedback-signin");
      expect(screen.queryByText(/could not be saved/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("nothing to rate", () => {
    it("renders no widget when there are no recommendations", async () => {
      renderSection(0);
      await screen.findByRole("heading", { name: /related external papers/i });
      expect(
        screen.queryByTestId("recommendation-feedback")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("recommendation-feedback-signin")
      ).not.toBeInTheDocument();
    });

    it("renders no widget when the backend issued no context", async () => {
      // An older backend, or a deployment with no signing secret. A rating
      // the server cannot verify is one it will refuse anyway.
      renderSection(3, { context: null });
      await screen.findByRole("heading", { name: /related external papers/i });
      expect(
        screen.queryByTestId("recommendation-feedback")
      ).not.toBeInTheDocument();
    });

    it("renders nothing standalone without a context", () => {
      const { container } = render(
        <AuthContext.Provider value={auth(true)}>
          <RecommendationFeedback paperId="abc123" />
        </AuthContext.Provider>
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("waits for the auth state rather than flashing the wrong thing", () => {
      const { container } = render(
        <AuthContext.Provider value={auth(false, true)}>
          <RecommendationFeedback paperId="abc123" context={CONTEXT} />
        </AuthContext.Provider>
      );
      expect(container).toBeEmptyDOMElement();
    });
  });
});
