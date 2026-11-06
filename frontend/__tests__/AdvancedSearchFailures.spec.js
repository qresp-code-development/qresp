/**
 * Advanced Search: one node failing must not take the page with it.
 *
 * The last blocking modal on this page. `/search`'s SSR load learned to tell
 * a failed node from a failed filter and to say so beside the results, but
 * `AdvancedSearch.onSubmit` still called the global `setAlert()` on any
 * server error -- so searching PaperStack and Duke together put an
 * un-dismissable dialog over PaperStack's perfectly good matches.
 *
 * These tests drive the REAL form inside the REAL page, so they exercise the
 * ownership question too: who holds the results, and who holds the status.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const routerEvents = {
  handlers: {},
  on() {},
  off() {},
};
jest.mock("next/router", () => ({
  useRouter: () => ({ reload: jest.fn(), events: routerEvents, push: jest.fn() }),
}));

jest.mock("axios");
import axios from "axios";

import AlertContext from "../Context/Alert/alertContext";
import LoadingContext from "../Context/Loading/loadingContext";
import ServerContext from "../Context/Servers/serverContext";
import Search from "../pages/search";

const ALPHA = "https://alpha.example.org";
const BETA = "https://beta.example.org";
// A public notice counts the sources that are down; it never names the
// institution operating one.
const ONE_UNAVAILABLE = /one source is unavailable/i;

const PAPER = (id, title) => ({
  _Search__id: id,
  _Search__title: title,
  _Search__authors: "Ada Lovelace",
  _Search__tags: ["dft"],
  _Search__year: 2024,
  _Search__abstract: "",
  _Search__doi: "",
  _Search__collections: [],
});

const dataWith = (papers) => ({
  papers,
  authors: ["Ada Lovelace"],
  collections: [],
  publications: [],
});

const NO_SSR_ERROR = { is: false, msg: "", failed: [], filters: {}, total: false };

const setAlert = jest.fn();
const showLoader = jest.fn();
const hideLoader = jest.fn();

// How the page loaded: every node answers its first, client-side fetch, with
// `pageLoad.papers[node]` as its records and `pageLoad.filters[node]` naming
// filter endpoints that fail. Advanced Search requests (`/api/search?…`) are
// answered by `respondWith` below.
let pageLoad = { papers: {}, filters: {} };
let searchAnswer = () => Promise.resolve({ data: [] });

const answer = (url) => {
  const [server, rest] = url.split("/api/");
  if (rest.startsWith("search?")) return searchAnswer(url);
  if ((pageLoad.filters[server] || []).includes(rest)) {
    return Promise.reject(new Error("filter unavailable"));
  }
  if (rest === "search") {
    return Promise.resolve({ data: pageLoad.papers[server] || [] });
  }
  return Promise.resolve({ data: dataWith({})[rest] || [] });
};

const renderSearch = async ({ papers = {}, error = NO_SSR_ERROR, selected } = {}) => {
  pageLoad = { papers, filters: (error && error.filters) || {} };
  axios.get.mockImplementation(answer);
  const view = render(
    <AlertContext.Provider value={{ setAlert, unsetAlert: jest.fn() }}>
      <LoadingContext.Provider value={{ showLoader, hideLoader }}>
        <ServerContext.Provider
          value={{ setSelected: jest.fn(), selected: selected || [ALPHA, BETA] }}
        >
          <Search selectedservers={selected || [ALPHA, BETA]} />
        </ServerContext.Provider>
      </LoadingContext.Provider>
    </AlertContext.Provider>
  );
  // Let the page's own load settle before the test drives the form.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return view;
};

// The form lives behind a Collapse; open it, then submit.
const runAdvancedSearch = async (user) => {
  await user.click(screen.getByRole("button", { name: /advanced search/i }));
  await user.click(screen.getByRole("button", { name: /^search$/i }));
};

// Answers Advanced Search's `/api/search?…` per server, failing the ones named.
const respondWith = (failing, records) => {
  searchAnswer = (url) => {
    const server = url.startsWith(ALPHA) ? ALPHA : BETA;
    if (failing.includes(server)) {
      return Promise.reject(new Error("boom: internal detail 10.0.0.5"));
    }
    return Promise.resolve({ data: (records || {})[server] || [] });
  };
  axios.get.mockImplementation(answer);
};

describe("Advanced Search server failures", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routerEvents.handlers = {};
  });

  it("updates the results and warns about nothing when every node answers", async () => {
    const user = userEvent.setup();
    respondWith([], {
      [ALPHA]: [PAPER("a", "Alpha match")],
      [BETA]: [PAPER("b", "Beta match")],
    });
    await renderSearch();
    await runAdvancedSearch(user);

    expect(await screen.findByText("Alpha match")).toBeInTheDocument();
    expect(screen.getByText("Beta match")).toBeInTheDocument();
    expect(screen.getByTestId("record-count")).toHaveTextContent(
      "2 Records Available"
    );
    expect(screen.queryByTestId("advanced-search-failure")).toBeNull();
    expect(setAlert).not.toHaveBeenCalled();
  });

  it("keeps the successful node's matches and warns inline about the other", async () => {
    const user = userEvent.setup();
    respondWith([BETA], { [ALPHA]: [PAPER("a", "Alpha match")] });
    await renderSearch();
    await runAdvancedSearch(user);

    expect(await screen.findByText("Alpha match")).toBeInTheDocument();
    const notice = await screen.findByTestId("advanced-search-failure");
    expect(notice).toHaveTextContent(/matching records are missing/i);
    expect(notice).toHaveTextContent(ONE_UNAVAILABLE);
    expect(notice).not.toHaveTextContent(BETA);
    expect(notice).not.toHaveTextContent(ALPHA);
    // No modal, ever, and no internal detail from the thrown error.
    expect(setAlert).not.toHaveBeenCalled();
    expect(screen.queryByText(/10\.0\.0\.5/)).toBeNull();
    expect(screen.queryByText(/boom/i)).toBeNull();
  });

  it("keeps the previous results when every node fails", async () => {
    const user = userEvent.setup();
    respondWith([ALPHA, BETA]);
    await renderSearch({ papers: { [ALPHA]: [PAPER("a", "Loaded earlier")] } });

    expect(screen.getByTestId("record-count")).toHaveTextContent(
      "1 Records Available"
    );

    await runAdvancedSearch(user);

    // The results on screen were valid before the search and still are.
    expect(await screen.findByTestId("advanced-search-failure")).toHaveTextContent(
      /previous results are still shown/i
    );
    expect(screen.getByText("Loaded earlier")).toBeInTheDocument();
    expect(screen.getByTestId("record-count")).toHaveTextContent(
      "1 Records Available"
    );
    expect(screen.queryByText(/0 +Records Available/i)).toBeNull();
    expect(
      within(screen.getByTestId("advanced-search-failure")).getByRole(
        "button",
        { name: /retry/i }
      )
    ).toBeInTheDocument();
    expect(setAlert).not.toHaveBeenCalled();
  });

  it("shows an unavailable state when everything fails and there was nothing", async () => {
    const user = userEvent.setup();
    respondWith([ALPHA, BETA]);
    await renderSearch({ papers: {} });
    await runAdvancedSearch(user);

    const notice = await screen.findByTestId("advanced-search-failure");
    expect(notice).toHaveTextContent(/could not be run/i);
    expect(
      within(notice).getByRole("button", { name: /retry/i })
    ).toBeInTheDocument();
    // Never "0 Records Available": nothing came back because the nodes are
    // down, not because they hold no matches.
    expect(screen.queryByTestId("record-count")).toBeNull();
    expect(screen.queryByText(/0 +Records Available/i)).toBeNull();
  });

  it("reports a genuine empty result as an ordinary 0 records", async () => {
    const user = userEvent.setup();
    respondWith([], { [ALPHA]: [], [BETA]: [] });
    await renderSearch({ papers: { [ALPHA]: [PAPER("a", "Before")] } });
    await runAdvancedSearch(user);

    await waitFor(() =>
      expect(screen.getByTestId("record-count")).toHaveTextContent(
        "0 Records Available"
      )
    );
    // A search that worked and matched nothing is not a failure.
    expect(screen.queryByTestId("advanced-search-failure")).toBeNull();
    expect(screen.queryByTestId("search-unavailable")).toBeNull();
    expect(setAlert).not.toHaveBeenCalled();
  });

  it("retries the same criteria against the same servers", async () => {
    const user = userEvent.setup();
    respondWith([BETA], { [ALPHA]: [PAPER("a", "Alpha match")] });
    await renderSearch();

    await user.click(screen.getByRole("button", { name: /advanced search/i }));
    await user.type(screen.getByPlaceholderText(/enter a title/i), "water");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    const notice = await screen.findByTestId("advanced-search-failure");
    const firstCalls = axios.get.mock.calls
      .map(([url]) => url)
      .filter((url) => url.includes("/api/search?"));
    expect(firstCalls.every((url) => url.includes("paperTitle=water"))).toBe(
      true
    );

    // Beta recovers.
    respondWith([], {
      [ALPHA]: [PAPER("a", "Alpha match")],
      [BETA]: [PAPER("b", "Beta match")],
    });
    await user.click(within(notice).getByRole("button", { name: /retry/i }));

    await waitFor(() =>
      expect(screen.queryByTestId("advanced-search-failure")).toBeNull()
    );
    // Same criteria, same servers.
    const retryCalls = axios.get.mock.calls
      .map(([url]) => url)
      .filter((url) => url.includes("/api/search?"));
    expect(retryCalls.every((url) => url.includes("paperTitle=water"))).toBe(
      true
    );
    expect(retryCalls.some((url) => url.startsWith(ALPHA))).toBe(true);
    expect(retryCalls.some((url) => url.startsWith(BETA))).toBe(true);
    expect(screen.getByText("Beta match")).toBeInTheDocument();
  });

  it("keeps what the curator typed after a failure", async () => {
    const user = userEvent.setup();
    respondWith([ALPHA, BETA]);
    await renderSearch();

    await user.click(screen.getByRole("button", { name: /advanced search/i }));
    await user.type(screen.getByPlaceholderText(/enter a title/i), "water");
    await user.type(screen.getByPlaceholderText(/enter a doi/i), "10.1/x");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    await screen.findByTestId("advanced-search-failure");
    expect(screen.getByPlaceholderText(/enter a title/i)).toHaveValue("water");
    expect(screen.getByPlaceholderText(/enter a doi/i)).toHaveValue("10.1/x");
  });

  it("clears the previous warning when a new search starts", async () => {
    const user = userEvent.setup();
    respondWith([BETA], { [ALPHA]: [PAPER("a", "Alpha match")] });
    await renderSearch();
    await runAdvancedSearch(user);
    await screen.findByTestId("advanced-search-failure");

    respondWith([], { [ALPHA]: [PAPER("a", "Alpha match")] });
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() =>
      expect(screen.queryByTestId("advanced-search-failure")).toBeNull()
    );
  });

  it("does not overwrite the SSR filter notice with a runtime one", async () => {
    // Two different statements about two different things: the page loaded
    // with an incomplete authors list, and a later search could not reach a
    // node. Both stay true.
    const user = userEvent.setup();
    respondWith([BETA], { [ALPHA]: [PAPER("a", "Alpha match")] });
    await renderSearch({
      papers: { [ALPHA]: [PAPER("a", "Alpha match")] },
      error: { ...NO_SSR_ERROR, is: true, filters: { [ALPHA]: ["authors"] } },
    });

    expect(screen.getByTestId("search-filter-failure")).toBeInTheDocument();
    await runAdvancedSearch(user);

    await screen.findByTestId("advanced-search-failure");
    expect(screen.getByTestId("search-filter-failure")).toBeInTheDocument();
    expect(screen.getByTestId("search-filter-failure")).toHaveTextContent(
      /authors/
    );
  });

  it("keeps each surviving record's source server in its link", async () => {
    const user = userEvent.setup();
    respondWith([BETA], { [ALPHA]: [PAPER("a", "Alpha match")] });
    await renderSearch();
    await runAdvancedSearch(user);
    await screen.findByText("Alpha match");

    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs.some((href) => href.includes(encodeURIComponent(ALPHA)))).toBe(
      true
    );
  });

  it("finishes the loader on success, partial failure and total failure", async () => {
    const user = userEvent.setup();

    for (const failing of [[], [BETA], [ALPHA, BETA]]) {
      jest.clearAllMocks();
      respondWith(failing, { [ALPHA]: [PAPER("a", "Alpha match")] });
      const view = await renderSearch();
      await runAdvancedSearch(user);
      await waitFor(() => expect(hideLoader).toHaveBeenCalled());
      expect(showLoader).toHaveBeenCalledTimes(1);
      expect(hideLoader).toHaveBeenCalledTimes(1);
      view.unmount();
    }
  });

  it("never uses the global alert for a search failure", async () => {
    const user = userEvent.setup();
    respondWith([ALPHA, BETA]);
    await renderSearch({ papers: { [ALPHA]: [PAPER("a", "Before")] } });
    await runAdvancedSearch(user);
    await screen.findByTestId("advanced-search-failure");
    expect(setAlert).not.toHaveBeenCalled();
  });
});
