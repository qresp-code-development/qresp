import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  IconButton,
  Tooltip,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { CheckCircle, Edit, ExpandMore, WarningAmber } from "@mui/icons-material";

import {
  cancelNextSectionClosed,
  onCollapseSections,
  shouldStartClosed,
  startNextSectionClosed,
} from "../Utils/sectionCollapse";

const StyledAccordion = styled(Accordion)(({ theme }) => ({
  borderRadius: "8px !important",
  margin: "10px 0 !important",
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: "none",
  "&::before": { display: "none" },
  "&.Mui-expanded": {
    borderColor: "#800000",
    borderLeftWidth: 3,
  },
}));

const StyledAccordionSummary = styled(AccordionSummary)({
  backgroundColor: "transparent",
  minHeight: 52,
  "&.Mui-expanded": { minHeight: 52 },
  "& .MuiAccordionSummary-content": {
    margin: "10px 0",
    alignItems: "center",
    gap: 8,
  },
});

const Drawer = (props) => {
  const {
    heading,
    children,
    defaultOpen = false,
    editor,
    editing = false,
    status,
    onToggle,
    // Closing an editing section by hand saves it: `autoSave` submits the
    // <form> inside it; `onAutoSave` is for a section that saves another way.
    autoSave = false,
    onAutoSave,
    // This section has changes that are not saved yet; Publish refuses
    // until it is. Shown in the header, so it is visible even closed.
    unsaved = false,
  } = props;
  // Right after a draft load or a return from the preview, sections start
  // closed (see Utils/sectionCollapse).
  const [ownOpen, setOwnOpen] = useState(() => defaultOpen && !shouldStartClosed());
  const body = useRef(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  // Controlled when the caller passes `open` (e.g. a section that collapses
  // itself on Save); otherwise the drawer keeps its own state as before.
  const controlled = typeof props.open === "boolean";
  const open = controlled ? props.open : ownOpen;
  const setOpen = (next) => {
    if (!controlled) setOwnOpen(next);
    if (onToggle) onToggle(next);
  };

  // Closed by hand while editing: save it. A valid form swaps itself for its
  // saved summary (which starts closed); one that cannot be saved yet is
  // still here a moment later, so it opens again to show what is missing.
  const saveOnClose = () => {
    if (onAutoSave) {
      onAutoSave();
      return;
    }
    if (!autoSave) return;
    const form = body.current && body.current.querySelector("form");
    if (!form) return;
    startNextSectionClosed();
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    setTimeout(() => {
      if (mounted.current) {
        cancelNextSectionClosed();
        setOpen(true);
      }
    }, 600);
  };

  useEffect(
    () =>
      onCollapseSections((next) => {
        setOwnOpen(next);
        if (onToggle) onToggle(next);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const hasPencil = Boolean(editor || editing);

  return (
    <StyledAccordion
      slotProps={{ transition: { timeout: 200 } }}
      expanded={open}
      onChange={(_, expanded) => {
        setOpen(expanded);
        if (!expanded && editing) saveOnClose();
      }}
    >
      <StyledAccordionSummary expandIcon={<ExpandMore />}>
        {status === "complete" && (
          <CheckCircle sx={{ fontSize: 18, color: "#2e7d32", flexShrink: 0 }} />
        )}
        {/* A span, not subtitle1's default <h6>: the Accordion already wraps
            the summary in an <h3>, and a heading inside a button is invalid. */}
        <Typography
          variant="subtitle1"
          component="span"
          fontWeight={600}
          sx={{
            color: open ? "#800000" : "#333333",
            flex: 1,
            transition: "color 0.2s",
          }}
        >
          {heading}
        </Typography>
        {unsaved ? (
          <Tooltip title="Save this section before publishing" placement="top" arrow>
            <Box
              component="span"
              data-testid="section-unsaved"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: 1,
                bgcolor: "#FFF4E5",
                color: "#B25E00",
                fontSize: "0.75rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <WarningAmber sx={{ fontSize: 16 }} aria-hidden="true" />
              Not saved
            </Box>
          </Tooltip>
        ) : null}
        {/* ONE PENCIL ON EVERY EDITABLE SECTION, filled in while the
            section is open and plain while it is closed. On a saved
            section it switches to editing; on one being edited it opens
            it. Rendered as a <span> role="button": the header is itself a
            <button>, and a <button> inside it is invalid HTML (React
            reports it on hydration). Inside the header, it lines up with
            the arrow by the header's own layout, whatever its height. */}
        {hasPencil ? (
          <Tooltip title={editing ? "Editing" : "Edit"} placement="top" arrow>
            <IconButton
              component="span"
              size="small"
              aria-pressed={editing}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
                if (!editing && editor) editor();
              }}
              onKeyDown={(e) => e.stopPropagation()}
              onFocus={(e) => e.stopPropagation()}
              sx={{
                color: open ? "#FFFFFF" : "#800000",
                bgcolor: open ? "#800000" : "transparent",
                flexShrink: 0,
                "&:hover": { bgcolor: open ? "#9a0000" : "rgba(128,0,0,0.08)" },
              }}
            >
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
      </StyledAccordionSummary>
      <AccordionDetails ref={body} sx={{ pt: 0, pb: 2 }}>
        <Box sx={{ width: "100%", display: "flex", flexDirection: "column" }}>
          {children}
        </Box>
      </AccordionDetails>
    </StyledAccordion>
  );
};

export { StyledAccordion, StyledAccordionSummary };

Drawer.propTypes = {
  heading: PropTypes.string.isRequired,
  children: PropTypes.any,
  defaultOpen: PropTypes.bool,
  editor: PropTypes.func,
  editing: PropTypes.bool,
  autoSave: PropTypes.bool,
  onAutoSave: PropTypes.func,
  unsaved: PropTypes.bool,
  status: PropTypes.oneOf(["complete", "incomplete", "optional"]),
  open: PropTypes.bool,
  onToggle: PropTypes.func,
};

export default Drawer;
