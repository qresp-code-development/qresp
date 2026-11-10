import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CuratorDraftNavigationGuard,
  CuratorEditNavigationGuard,
} from "../pages/curator";
import AlertContext from "../Context/Alert/alertContext";
import AuthContext from "../Context/Auth/authContext";
import CuratorContext from "../Context/Curator/curatorContext";

const mockPush = jest.fn();

jest.mock("yet-another-react-lightbox", () => function Lightbox() {
  return null;
});
jest.mock("yet-another-react-lightbox/plugins/captions", () => ({}));
jest.mock("yet-another-react-lightbox/plugins/thumbnails", () => ({}));

jest.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/curator",
    push: mockPush,
    query: {},
  }),
}));

const renderGuard = () => {
  const saveDraftToServer = jest.fn(() => Promise.resolve("draft123"));
  const unsetAlert = jest.fn();

  const Harness = () => {
    const [alertContent, setAlertContent] = useState(null);
    return (
      <CuratorContext.Provider
        value={{
          getDraftTitle: jest.fn(() => "Leaving draft"),
          hasUnsavedDraftChanges: jest.fn(() => true),
          hasMeaningfulDraft: jest.fn(() => true),
          saveDraft: jest.fn(),
          draftDirty: true,
          saveDraftToServer,
        }}
      >
        <AuthContext.Provider value={{ authenticated: true }}>
          <AlertContext.Provider
            value={{
              setAlert: jest.fn((title, message, content) =>
                setAlertContent(content)
              ),
              unsetAlert: () => {
                unsetAlert();
                setAlertContent(null);
              },
            }}
          >
            <a href="/explorer">Explorer</a>
            {alertContent ? <div>{alertContent}</div> : null}
            <CuratorDraftNavigationGuard editMode={false} />
          </AlertContext.Provider>
        </AuthContext.Provider>
      </CuratorContext.Provider>
    );
  };

  render(<Harness />);
  return { saveDraftToServer, unsetAlert };
};

const renderEditGuard = ({ hasChanges = true } = {}) => {
  const setAlert = jest.fn();
  const unsetAlert = jest.fn();

  const Harness = () => {
    const [alertContent, setAlertContent] = useState(null);
    return (
      <CuratorContext.Provider
        value={{
          hasUnsavedDraftChanges: jest.fn(() => hasChanges),
        }}
      >
        <AuthContext.Provider value={{ authenticated: true }}>
          <AlertContext.Provider
            value={{
              setAlert: setAlert.mockImplementation(
                (title, message, content) => setAlertContent(content)
              ),
              unsetAlert: () => {
                unsetAlert();
                setAlertContent(null);
              },
            }}
          >
            <a href="/explorer">Explorer</a>
            {alertContent ? <div>{alertContent}</div> : null}
            <CuratorEditNavigationGuard />
          </AlertContext.Provider>
        </AuthContext.Provider>
      </CuratorContext.Provider>
    );
  };

  render(<Harness />);
  return { setAlert, unsetAlert };
};

describe("CuratorEditNavigationGuard", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("offers Leave Without Saving / Stay on unsaved edits — and no draft saving", async () => {
    const user = userEvent.setup();
    const { setAlert } = renderEditGuard();

    await user.click(screen.getByRole("link", { name: /explorer/i }));

    expect(setAlert).toHaveBeenCalledWith(
      "Leave without saving?",
      expect.stringContaining("unsaved changes"),
      expect.anything(),
      { hideDismiss: true }
    );
    // Edit mode has no draft flow: the dialog must not offer to save a draft.
    expect(
      screen.queryByRole("button", { name: /save draft/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /leave without saving/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stay/i })).toBeInTheDocument();
  });

  it("navigates on Leave Without Saving and stays on Stay", async () => {
    const user = userEvent.setup();
    renderEditGuard();

    await user.click(screen.getByRole("link", { name: /explorer/i }));
    await user.click(screen.getByRole("button", { name: /stay/i }));
    expect(mockPush).not.toHaveBeenCalled();

    await user.click(screen.getByRole("link", { name: /explorer/i }));
    await user.click(
      screen.getByRole("button", { name: /leave without saving/i })
    );
    expect(mockPush).toHaveBeenCalledWith("/explorer");
  });

  it("does not intercept navigation when there are no unsaved edits", async () => {
    const user = userEvent.setup();
    const { setAlert } = renderEditGuard({ hasChanges: false });

    await user.click(screen.getByRole("link", { name: /explorer/i }));
    expect(setAlert).not.toHaveBeenCalled();
  });
});

describe("CuratorDraftNavigationGuard", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("asks for a draft name before saving and leaving", async () => {
    const user = userEvent.setup();
    const { saveDraftToServer, unsetAlert } = renderGuard();

    await user.click(screen.getByRole("link", { name: /explorer/i }));
    await user.click(
      screen.getByRole("button", { name: /save draft and leave/i })
    );

    expect(await screen.findByLabelText(/draft name/i)).toHaveValue(
      "Leaving draft"
    );
    await user.clear(screen.getByLabelText(/draft name/i));
    await user.type(screen.getByLabelText(/draft name/i), "Named leave draft");
    await user.click(
      screen.getByRole("button", { name: /save draft and leave/i })
    );

    await waitFor(() =>
      expect(saveDraftToServer).toHaveBeenCalledWith("Named leave draft")
    );
    expect(unsetAlert).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/explorer");
  });
});
