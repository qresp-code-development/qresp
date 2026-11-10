import { useState } from "react";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";

import SortableRows from "../components/Form/SortableRows";

// Order matters for authors: a row is moved by dragging its handle, or with
// the arrow keys on the handle.
const List = ({ initial = ["Somjit", "Davidsson", "Jin", "Galli"], withInputs = false }) => {
  const [names, setNames] = useState(initial);
  const move = (from, to) =>
    setNames((was) => {
      const next = [...was];
      const [picked] = next.splice(from, 1);
      next.splice(to, 0, picked);
      return next;
    });
  return (
    <>
      <SortableRows
        items={names}
        getKey={(name) => name}
        onMove={move}
        noun="author"
        renderRow={(name) => (withInputs ? <input aria-label={name} defaultValue={name} /> : <span>{name}</span>)}
      />
      <output data-testid="order">{names.join(",")}</output>
    </>
  );
};

const order = () => screen.getByTestId("order").textContent;
const dataTransfer = () => ({
  effectAllowed: "",
  dropEffect: "",
  setData: () => {},
  setDragImage: () => {},
});

// jsdom has no layout, so each row is given one: row i spans y = 50i..50i+40.
// A pointer above a row's middle inserts before it, below inserts after.
beforeEach(() => {
  jest.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function () {
    const id = this.getAttribute && this.getAttribute("data-testid");
    const match = id && id.match(/^sortable-row-(\d+)$/);
    const i = match ? Number(match[1]) : 0;
    return { top: i * 50, height: 40, bottom: i * 50 + 40, left: 0, right: 0, width: 0, x: 0, y: i * 50 };
  });
});
afterEach(() => jest.restoreAllMocks());

// jsdom has no DragEvent, so a drag event is a plain Event and an init
// `clientY` is dropped; set it on the event itself.
const pointerAt = (event, clientY) => {
  Object.defineProperty(event, "clientY", { value: clientY });
  return event;
};

const row = (i) => screen.getByTestId(`sortable-row-${i}`);
const drag = (fromIndex, clientY, { onField = false } = {}) => {
  const press = onField ? row(fromIndex).querySelector("input") : row(fromIndex);
  fireEvent.mouseDown(press);
  fireEvent.dragStart(row(fromIndex), { dataTransfer: dataTransfer() });
  const list = row(0).parentElement.parentElement;
  fireEvent(list, pointerAt(createEvent.dragOver(list, { dataTransfer: dataTransfer() }), clientY));
  fireEvent(list, pointerAt(createEvent.drop(list, { dataTransfer: dataTransfer() }), clientY));
};

describe("reordering authors", () => {
  it("drags the last author to the front", () => {
    render(<List />);
    drag(3, 5);
    expect(order()).toBe("Galli,Somjit,Davidsson,Jin");
  });

  it("drags the first author below the second", () => {
    render(<List />);
    drag(0, 75); // lower half of row 1
    expect(order()).toBe("Davidsson,Somjit,Jin,Galli");
  });

  it("drags an author to the very end", () => {
    render(<List />);
    drag(1, 500);
    expect(order()).toBe("Somjit,Jin,Galli,Davidsson");
  });

  it("drops where it started without changing anything", () => {
    render(<List />);
    drag(1, 55);
    expect(order()).toBe("Somjit,Davidsson,Jin,Galli");
  });

  it("does not drag when the press starts in a text field", () => {
    render(<List withInputs />);
    drag(3, 5, { onField: true });
    expect(order()).toBe("Somjit,Davidsson,Jin,Galli");
  });

  it("shows where the author will land", async () => {
    render(<List />);
    fireEvent.mouseDown(row(3));
    fireEvent.dragStart(row(3), { dataTransfer: dataTransfer() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.dragOver(row(0).parentElement.parentElement, { clientY: 5, dataTransfer: dataTransfer() });
    expect(await screen.findByTestId("sortable-drop-marker")).toBeInTheDocument();
  });

  it("moves with the arrow keys on the handle", () => {
    render(<List />);
    fireEvent.keyDown(screen.getByTestId("sortable-handle-2"), { key: "ArrowUp" });
    expect(order()).toBe("Somjit,Jin,Davidsson,Galli");
    fireEvent.keyDown(screen.getByTestId("sortable-handle-0"), { key: "ArrowUp" });
    expect(order()).toBe("Somjit,Jin,Davidsson,Galli");
    fireEvent.keyDown(screen.getByTestId("sortable-handle-3"), { key: "ArrowDown" });
    expect(order()).toBe("Somjit,Jin,Davidsson,Galli");
  });

  it("names each handle for a screen reader", () => {
    render(<List />);
    expect(screen.getByRole("button", { name: "Move author 1 of 4" })).toBeInTheDocument();
  });
});
