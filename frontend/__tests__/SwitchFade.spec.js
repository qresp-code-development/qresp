import { render, screen } from "@testing-library/react";

import SwitchFade from "../components/switchFade";

// Regression guard for the /curator crash: react-transition-group falls back
// to findDOMNode (removed in React 19) when a Transition lacks nodeRef, which
// threw in performExit as soon as SwitchTransition toggled sides.
describe("SwitchFade", () => {
  it("renders the form side while editing", () => {
    render(
      <SwitchFade editing={true} form={<div>FORM</div>} display={<div>DISPLAY</div>} />
    );
    expect(screen.getByText("FORM")).toBeInTheDocument();
    expect(screen.queryByText("DISPLAY")).not.toBeInTheDocument();
  });

  it("toggles to the display side without crashing (React 19 nodeRef)", async () => {
    const ui = (editing) => (
      <SwitchFade
        editing={editing}
        form={<div>FORM</div>}
        display={<div>DISPLAY</div>}
      />
    );
    const { rerender } = render(ui(true));
    expect(screen.getByText("FORM")).toBeInTheDocument();

    // Without nodeRef this rerender throws "findDOMNode is not a function"
    // from the exit transition under React 19.
    rerender(ui(false));
    expect(await screen.findByText("DISPLAY")).toBeInTheDocument();
    expect(screen.queryByText("FORM")).not.toBeInTheDocument();

    rerender(ui(true));
    expect(await screen.findByText("FORM")).toBeInTheDocument();
  });
});
