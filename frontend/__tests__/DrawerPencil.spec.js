import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Drawer from "../components/drawer";

// Every editable section carries the same pencil, whether it is showing its
// saved summary or its form.
describe("the section pencil", () => {
  it("switches a saved section to editing and opens it", async () => {
    const editor = jest.fn();
    render(<Drawer heading="Curator Information" editor={editor}>x</Drawer>);
    const pencil = screen.getByRole("button", { name: "Edit" });
    expect(pencil).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(pencil);
    expect(editor).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /curator information/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("is shown pressed on a section being edited, and only opens it", async () => {
    const editor = jest.fn();
    render(<Drawer heading="Who is Curating the paper" editing editor={editor}>x</Drawer>);
    const pencil = screen.getByRole("button", { name: "Editing" });
    expect(pencil).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(pencil);
    expect(editor).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /who is curating/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("is absent on a read-only section", () => {
    render(<Drawer heading="Charts">x</Drawer>);
    expect(screen.queryByRole("button", { name: /^edit/i })).toBeNull();
  });
});

describe("closing a section that is being edited", () => {
  const Section = ({ onSubmit, ...props }) => (
    <Drawer heading="Choose a License" defaultOpen editing autoSave {...props}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input aria-label="licence" />
      </form>
    </Drawer>
  );
  const header = () => screen.getByRole("button", { name: /choose a license/i });

  it("saves it", async () => {
    const onSubmit = jest.fn();
    render(<Section onSubmit={onSubmit} />);
    await userEvent.click(header());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("opens again when it could not be saved, to show what is missing", async () => {
    // A form that fails validation stays mounted instead of swapping itself
    // for its saved summary.
    render(<Section onSubmit={() => {}} />);
    await userEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(header()).toHaveAttribute("aria-expanded", "true"), {
      timeout: 1500,
    });
  });

  it("does not save a section that is not being edited", async () => {
    const onSubmit = jest.fn();
    render(<Section onSubmit={onSubmit} editing={false} editor={() => {}} />);
    await userEvent.click(header());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("uses the section's own save when it has one", async () => {
    const onAutoSave = jest.fn();
    render(
      <Drawer heading="Build your workflow" defaultOpen editing onAutoSave={onAutoSave}>
        x
      </Drawer>
    );
    await userEvent.click(screen.getByRole("button", { name: /build your workflow/i }));
    expect(onAutoSave).toHaveBeenCalledTimes(1);
  });
});

describe("the Not saved warning", () => {
  it("shows on a section with unsaved changes, even when it is closed", () => {
    render(<Drawer heading="Choose a License" editing unsaved>x</Drawer>);
    expect(screen.getByTestId("section-unsaved")).toHaveTextContent(/not saved/i);
  });

  it("is absent once the section is saved", () => {
    render(<Drawer heading="License" editor={() => {}}>x</Drawer>);
    expect(screen.queryByTestId("section-unsaved")).toBeNull();
  });
});
