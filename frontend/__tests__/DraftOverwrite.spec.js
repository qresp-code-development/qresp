/**
 * One account draft per piece of work. Saving again overwrites it -- after a
 * reload, after another page, and when a draft of the same name already
 * exists -- instead of piling up copies.
 */
import { useContext } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("../Utils/serverDrafts", () => ({
  saveServerDraft: jest.fn(),
  listServerDrafts: jest.fn(),
}));
import { listServerDrafts, saveServerDraft } from "../Utils/serverDrafts";

import CuratorState from "../Context/Curator/CuratorState";
import CuratorContext from "../Context/Curator/curatorContext";
import { isNamedDraftTitle } from "../Utils/draftTitle";

const Probe = ({ title = "My paper", twice = false }) => {
  const { saveDraftToServer, resumeDraft } = useContext(CuratorContext);
  return (
    <div>
      <button
        onClick={() => {
          saveDraftToServer(title);
          if (twice) saveDraftToServer(title);
        }}
      >
        save
      </button>
      <button onClick={() => resumeDraft()}>resume</button>
    </div>
  );
};

const mount = (props) =>
  render(
    <CuratorState>
      <Probe {...props} />
    </CuratorState>
  );

beforeEach(() => {
  window.localStorage.clear();
  jest.resetAllMocks();
  listServerDrafts.mockResolvedValue([]);
  let n = 0;
  saveServerDraft.mockImplementation((id, state, title) =>
    Promise.resolve({ id: id || `new${(n += 1)}`, title })
  );
});

describe("saving an account draft", () => {
  it("overwrites a draft that already has the same name", async () => {
    listServerDrafts.mockResolvedValue([
      { id: "old", title: "my  PAPER", updated_at: "2026-01-01T00:00:00" },
      { id: "newer", title: "My paper", updated_at: "2026-02-01T00:00:00" },
      { id: "other", title: "Something else", updated_at: "2026-03-01T00:00:00" },
    ]);
    mount();
    await userEvent.click(screen.getByText("save"));
    await waitFor(() => expect(saveServerDraft).toHaveBeenCalled());
    expect(saveServerDraft.mock.calls[0][0]).toBe("newer");
  });

  it("never matches the Untitled placeholder", async () => {
    listServerDrafts.mockResolvedValue([{ id: "u", title: "Untitled draft" }]);
    mount({ title: "Untitled draft" });
    await userEvent.click(screen.getByText("save"));
    await waitFor(() => expect(saveServerDraft).toHaveBeenCalled());
    expect(saveServerDraft.mock.calls[0][0]).toBeNull();
    expect(listServerDrafts).not.toHaveBeenCalled();
  });

  it("gives two quick saves one draft, not two", async () => {
    mount({ twice: true });
    await userEvent.click(screen.getByText("save"));
    await waitFor(() => expect(saveServerDraft).toHaveBeenCalledTimes(2));
    expect(saveServerDraft.mock.calls[0][0]).toBeNull();
    expect(saveServerDraft.mock.calls[1][0]).toBe("new1");
  });

  it("keeps the draft id with the browser copy, so a reload overwrites it", async () => {
    const first = mount();
    await userEvent.click(screen.getByText("save"));
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem("state:activeDraft"))).toEqual({
        id: "new1",
        title: "My paper",
      })
    );
    first.unmount();

    // A reload: the browser copy is resumed, and with it the draft id.
    window.localStorage.setItem("state", JSON.stringify({ referenceInfo: { title: "My paper" } }));
    mount();
    await userEvent.click(screen.getByText("resume"));
    await userEvent.click(screen.getByText("save"));
    await waitFor(() => expect(saveServerDraft).toHaveBeenCalledTimes(2));
    expect(saveServerDraft.mock.calls[1][0]).toBe("new1");
    expect(listServerDrafts).toHaveBeenCalledTimes(1);
  });

  it("starts a new draft when the tracked one was deleted elsewhere", async () => {
    window.localStorage.setItem("state", JSON.stringify({ referenceInfo: { title: "My paper" } }));
    window.localStorage.setItem("state:activeDraft", JSON.stringify({ id: "gone", title: "My paper" }));
    saveServerDraft.mockImplementation((id, state, title) =>
      id === "gone"
        ? Promise.reject({ response: { status: 404 } })
        : Promise.resolve({ id: "fresh", title })
    );
    mount();
    await userEvent.click(screen.getByText("resume"));
    await userEvent.click(screen.getByText("save"));
    await waitFor(() => expect(saveServerDraft).toHaveBeenCalledTimes(2));
    expect(saveServerDraft.mock.calls[1][0]).toBeNull();
  });
});

describe("what counts as a name", () => {
  it("treats the placeholder and blanks as untitled", () => {
    expect(isNamedDraftTitle("My paper")).toBe(true);
    expect(isNamedDraftTitle("Untitled draft")).toBe(false);
    expect(isNamedDraftTitle("  untitled   DRAFT ")).toBe(false);
    expect(isNamedDraftTitle("")).toBe(false);
  });
});
