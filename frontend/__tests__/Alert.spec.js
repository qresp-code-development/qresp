import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AlertDialog from "../components/alert";
import AlertContext from "../Context/Alert/alertContext";

describe("Alert Tests", () => {
  const context = {
    open: true,
    title: "Title",
    msg: "Message",
    buttons: null,
    unsetAlert: jest.fn(),
  };

  const renderAlert = () =>
    render(
      <AlertContext.Provider value={context}>
        <AlertDialog />
      </AlertContext.Provider>
    );

  it("renders the dialog with its title and message", () => {
    renderAlert();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Message")).toBeInTheDocument();
  });

  it("dismisses through the Dismiss button", async () => {
    const user = userEvent.setup();
    renderAlert();
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(context.unsetAlert).toHaveBeenCalled();
  });
});
