import { useContext, useState, useEffect } from "react";

import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  useTheme,
  Typography,
  Box,
  LinearProgress,
} from "@mui/material";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  faChevronRight,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";

import {
  faCheckSquare,
  faSquare,
  faPlusSquare,
  faMinusSquare,
  faFolder,
  faFolderOpen,
  faFile,
} from "@fortawesome/free-regular-svg-icons";

import CheckboxTree from "react-checkbox-tree";

import { RegularStyledButton } from "../components/button";

import { getList } from "../Utils/Scraper";

import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";
import CuratorContext from "../Context/Curator/curatorContext";

const FileTree = () => {
  const {
    selectorOpen,
    tree,
    showSelector,
    closeSelector,
    checked,
    setChecked,
    title,
    multiple,
    save,
    confirmLabel,
    setChildren,
  } = useContext(SourceTreeContext);

  const { fileServerPath } = useContext(CuratorContext);

  const [expanded, setExpanded] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectorOpen) {
      setChecked([]);
    }
  }, [selectorOpen]);

  const theme = useTheme();

  // What the curator has picked, as one line. A picker that takes ONE folder
  // is only confirmable with exactly one: `save` writes a single path, and a
  // comma-joined list would land in a field that means one location.
  const selection = multiple ? checked.join(", ") : checked[0] || "";
  const canConfirm = multiple ? checked.length > 0 : checked.length === 1;

  const confirm = () => {
    if (!canConfirm) return;
    // Unchanged contract: hand the chosen path(s) to whichever form opened
    // the picker, and close ONLY the picker. Nothing else is committed here.
    if (typeof save === "function") save(selection);
    closeSelector();
  };

  return (
    <Dialog
      open={showSelector}
      onClose={closeSelector}
      maxWidth="md"
      fullWidth
      scroll="paper"
      aria-labelledby="file-tree-title"
      slotProps={{
        paper: {
          sx: {
            // ONE scroll owner: the folder tree. The Paper never scrolls, so
            // the header and the actions cannot be scrolled away, there is no
            // second scrollbar beside the tree's own, and the page behind the
            // dialog does not move with the wheel.
            overflow: "hidden",
            // A grid, not a flex column: four rows of a stated size cannot
            // collapse or leave a gap. `minmax(0, 1fr)` is what lets the tree
            // row shrink to the space that is actually left, and the last row
            // pins the actions to the bottom edge whatever the tree does.
            display: "grid",
            gridTemplateRows: "auto 4px minmax(0, 1fr) auto",
            // A grid's implicit column is sized to its widest item, so one
            // unbreakable folder name would widen every row past the dialog
            // and change how the tree wraps. `minmax(0, 1fr)` lets the column
            // shrink to the Paper instead.
            gridTemplateColumns: "minmax(0, 1fr)",
            minHeight: 0,
            // The Paper carries a margin on every side, and the dialog's
            // container is exactly the viewport with NO overflow of its own.
            // A max-height that ignores that margin makes the Paper taller
            // than the container, and whatever sits at the top edge — here,
            // the title and the current selection — is pushed off screen with
            // no way to scroll it back. Height and margin are stated together
            // so they can never drift apart again.
            m: { xs: 2, sm: 4 },
            height: {
              xs: "calc(100dvh - 32px)",
              sm: "min(760px, calc(100dvh - 64px))",
            },
            maxHeight: { xs: "calc(100% - 32px)", sm: "calc(100% - 64px)" },
          },
        },
      }}
    >
      {/* Fixed, non-scrolling header. Its height does NOT depend on the
          selection: the same two lines are rendered whether or not something
          is checked, so checking a box cannot resize the dialog or move the
          tree under the pointer. */}
      <DialogTitle component="div" sx={{ flexShrink: 0, pb: 1 }}>
        <Typography id="file-tree-title" variant="h6" component="h2">
          {title}
        </Typography>
        <Box
          sx={{
            mt: 1,
            display: "flex",
            alignItems: "baseline",
            gap: 1,
            minWidth: 0,
            border: 1,
            borderColor: theme.palette.secondary.main,
            borderRadius: 1,
            px: 1,
            py: 0.75,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ flexShrink: 0 }}
          >
            {multiple ? "Selected" : "Current selection"}
          </Typography>
          {/* One line, always. A long path is truncated with an ellipsis and
              kept in full in the tooltip, so it can never push the header
              taller or the actions sideways. */}
          <Typography
            variant="body2"
            component="div"
            data-testid="filetree-selection"
            title={selection}
            noWrap
            sx={{
              flexGrow: 1,
              minWidth: 0,
              fontFamily: "monospace",
              fontStyle: selection ? "normal" : "italic",
              color: selection ? "text.primary" : "text.secondary",
            }}
          >
            {selection || "Nothing currently selected"}
          </Typography>
        </Box>
      </DialogTitle>
      {/* A fixed 4px slot: the progress bar appearing and disappearing must
          not move the tree either. */}
      <Box sx={{ height: 4, flexShrink: 0 }}>
        {loading && <LinearProgress color="primary" />}
      </Box>
      <DialogContent
        dividers
        data-testid="filetree-content"
        sx={{
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          // THE fix for the jump. react-checkbox-tree hides its native
          // checkbox with `position: absolute; opacity: 0` and no offsets, so
          // it resolves against the nearest POSITIONED ancestor. Without this
          // that ancestor was MUI's Paper (`position: relative`), which put
          // every hidden input of a 4000px tree into the Paper's own
          // scrollable overflow. Clicking one focused it, and Chrome scrolled
          // the Paper — `overflow: hidden` clips, it does not stop the user
          // agent scrolling to a focused element — carrying the tree and the
          // action row thousands of pixels above the dialog and leaving the
          // white space underneath. Anchoring the inputs to the scroller they
          // actually live in makes that scroll a no-op.
          position: "relative",
          // The tree is the only thing that scrolls, and only vertically.
          // react-checkbox-tree lays a row out as a flex line whose children
          // never shrink, so one long folder name used to widen the row past
          // the dialog — and because the library reverses the row direction,
          // the overflow went off the LEFT edge, taking the checkbox and the
          // expander with it. Names wrap instead.
          overflowX: "hidden",
          "& .react-checkbox-tree": { flexDirection: "row" },
          "& .react-checkbox-tree > ol": { minWidth: 0, flex: "1 1 auto" },
          "& .rct-text": { alignItems: "flex-start", minWidth: 0 },
          "& .rct-text > label": { minWidth: 0, alignItems: "flex-start" },
          "& .rct-collapse, & .rct-checkbox, & .rct-node-icon": {
            flexShrink: 0,
          },
          // The expander is `align-self: stretch` in the library, which
          // centres its chevron in the middle of a name that wrapped onto
          // three lines. It belongs beside the checkbox, on the first line.
          "& .rct-collapse": { alignSelf: "flex-start" },
          // The node's name. `.rct-label` is what react-checkbox-tree 2.x
          // renders; `.rct-title` is the 1.x name, kept so a version bump
          // cannot silently bring the overflow back.
          "& .rct-label, & .rct-title": {
            minWidth: 0,
            overflowWrap: "anywhere",
          },
        }}
      >
        <CheckboxTree
          nodes={tree}
          checked={checked}
          expanded={expanded}
          // react-checkbox-tree hands us the whole checked list AND the node
          // that was toggled, with `checked` already flipped. A picker that
          // takes ONE folder reads the node: diffing the two arrays gave the
          // same answer in the ordinary case, but silently produced two
          // selections whenever the previous path had dropped out of the tree
          // (a reload, or a parent whose children were fetched). One node in,
          // one path out.
          onCheck={(newChecked, targetNode) => {
            if (!multiple) {
              setChecked(targetNode.checked ? [targetNode.value] : []);
              return;
            }
            setChecked(newChecked);
          }}
          onExpand={(expanded, target) => {
            if (target.expanded && target.children.length == 0) {
              setLoading(true);
              getList(
                `${fileServerPath}${target.value}`,
                "http",
                false,
                !fileServerPath ? null : fileServerPath
              )
                .then((res) => {
                  if (target.expanded) {
                    setChildren(target.value, res.files);
                  }
                })
                .finally(() => setLoading(false));
            }
            setExpanded(expanded);
          }}
          iconsClass="fa5"
          icons={{
            check: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-check"
                icon={faCheckSquare}
                color={theme.palette.primary.main}
              />
            ),
            uncheck: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-uncheck"
                icon={faSquare}
              />
            ),
            halfCheck: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-half-check"
                icon={faCheckSquare}
              />
            ),
            expandClose: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-expand-close"
                icon={faChevronRight}
              />
            ),
            expandOpen: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-expand-open"
                icon={faChevronDown}
              />
            ),
            expandAll: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-expand-all"
                icon={faPlusSquare}
              />
            ),
            collapseAll: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-collapse-all"
                icon={faMinusSquare}
              />
            ),
            parentClose: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-parent-close"
                icon={faFolder}
                color={theme.palette.primary.main}
              />
            ),
            parentOpen: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-parent-open"
                icon={faFolderOpen}
                color={theme.palette.primary.main}
              />
            ),
            leaf: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-leaf-close"
                icon={faFile}
                color={theme.palette.primary.main}
              />
            ),
          }}
          noCascade
        />
      </DialogContent>
      {/* Always visible, always at the bottom, never inside the scroller. A
          curator who has picked a folder can always confirm it. */}
      <DialogActions
        disableSpacing
        data-testid="filetree-actions"
        sx={{
          flexShrink: 0,
          flexWrap: "wrap",
          justifyContent: "flex-end",
          gap: 1,
          p: 2,
        }}
      >
        {/* type="button" on both: the picker is a portal, but these must
            never submit a form under any future mounting. */}
        <RegularStyledButton
          type="button"
          onClick={closeSelector}
          sx={{ whiteSpace: "nowrap" }}
        >
          Cancel
        </RegularStyledButton>
        <RegularStyledButton
          type="button"
          onClick={confirm}
          disabled={!canConfirm}
          sx={{ whiteSpace: "nowrap" }}
        >
          {confirmLabel || "Save"}
        </RegularStyledButton>
      </DialogActions>
    </Dialog>
  );
};

export default FileTree;
