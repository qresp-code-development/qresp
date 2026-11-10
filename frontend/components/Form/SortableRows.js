import { useRef, useState } from "react";
import PropTypes from "prop-types";

import { Box } from "@mui/material";
import { DragIndicator } from "@mui/icons-material";

// A LIST WHOSE ORDER MEANS SOMETHING -- authors, above all -- reordered by
// dragging a row, or by focusing its handle and pressing the arrow keys.
//
// The WHOLE ROW drags, from anywhere except inside a text field: pressing in
// a field is how its text is selected, so a row only becomes draggable when
// the press starts outside one. No library: the browser's own drag and drop,
// and the caller's `onMove(from, to)` (react-hook-form's useFieldArray
// `move`) does the reordering.
const FIELD = "input, textarea, select, [contenteditable='true']";

// Where in the list a pointer at `clientY` would insert: 0 = before the
// first row, n = after the last. Read from the rows' real positions.
const insertionAt = (container, clientY) => {
  const rows = Array.from(container.querySelectorAll("[data-sortable-row]"));
  for (let i = 0; i < rows.length; i += 1) {
    const rect = rows[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return rows.length;
};

const SortableRows = ({ items, getKey, onMove, renderRow, noun = "item" }) => {
  const list = useRef(null);
  // The row being dragged. Kept in a ref as well as state: the drop must not
  // depend on a re-render having happened since the drag started.
  const from = useRef(null);
  const [dragFrom, setDragFrom] = useState(null);
  const [dropAt, setDropAt] = useState(null);
  // Which row may drag right now: armed by a press outside its text fields.
  const [armed, setArmed] = useState(null);

  const reset = () => {
    from.current = null;
    setDragFrom(null);
    setDropAt(null);
    setArmed(null);
  };

  const finish = (clientY) => {
    const start = from.current;
    if (start !== null && list.current) {
      const at =
        typeof clientY === "number" ? insertionAt(list.current, clientY) : dropAt;
      if (at !== null && at !== undefined) {
        const to = at > start ? at - 1 : at;
        if (to !== start) onMove(start, to);
      }
    }
    reset();
  };

  const marker = (position) =>
    dragFrom !== null && dropAt === position ? (
      <Box
        aria-hidden="true"
        data-testid="sortable-drop-marker"
        sx={{ height: 3, borderRadius: 2, bgcolor: "#800000", my: -0.25 }}
      />
    ) : null;

  return (
    <Box
      ref={list}
      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      onDragOver={(e) => {
        if (from.current === null) return;
        // Required for the drop to be allowed here at all.
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const at = insertionAt(e.currentTarget, e.clientY);
        if (at !== dropAt) setDropAt(at);
      }}
      onDrop={(e) => {
        if (from.current === null) return;
        // Also stops a text field from inserting the dragged data as text.
        e.preventDefault();
        finish(e.clientY);
      }}
    >
      {items.map((item, index) => (
        <Box key={getKey(item, index)} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {marker(index)}
          <Box
            data-sortable-row
            data-testid={`sortable-row-${index}`}
            draggable={armed === index}
            onPointerDown={(e) => setArmed(e.target.closest(FIELD) ? null : index)}
            onMouseDown={(e) => setArmed(e.target.closest(FIELD) ? null : index)}
            onDragStart={(e) => {
              if (armed !== index) {
                e.preventDefault();
                return;
              }
              from.current = index;
              e.dataTransfer.effectAllowed = "move";
              // Firefox will not start a drag without data.
              e.dataTransfer.setData("text/plain", "");
              if (e.dataTransfer.setDragImage) {
                e.dataTransfer.setDragImage(e.currentTarget, 24, 24);
              }
              // After this event: re-rendering the source during dragstart
              // makes Chrome cancel the drag.
              setTimeout(() => setDragFrom(index), 0);
            }}
            onDragEnd={reset}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              borderRadius: 1,
              opacity: dragFrom === index ? 0.4 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <Box
              role="button"
              tabIndex={0}
              title="Drag to reorder, or use the arrow keys"
              aria-label={`Move ${noun} ${index + 1} of ${items.length}`}
              data-testid={`sortable-handle-${index}`}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" && index > 0) {
                  e.preventDefault();
                  onMove(index, index - 1);
                } else if (e.key === "ArrowDown" && index < items.length - 1) {
                  e.preventDefault();
                  onMove(index, index + 1);
                }
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 40,
                flexShrink: 0,
                borderRadius: 1,
                color: "text.secondary",
                cursor: dragFrom === null ? "grab" : "grabbing",
                "&:hover": { bgcolor: "rgba(128,0,0,0.06)", color: "#800000" },
                "&:focus-visible": { outline: "2px solid #800000", outlineOffset: 1 },
              }}
            >
              <DragIndicator fontSize="small" />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>{renderRow(item, index)}</Box>
          </Box>
        </Box>
      ))}
      {marker(items.length)}
    </Box>
  );
};

SortableRows.propTypes = {
  items: PropTypes.array.isRequired,
  getKey: PropTypes.func.isRequired,
  onMove: PropTypes.func.isRequired,
  renderRow: PropTypes.func.isRequired,
  noun: PropTypes.string,
};

export default SortableRows;
