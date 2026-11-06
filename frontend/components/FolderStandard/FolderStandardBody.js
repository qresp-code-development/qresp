import { Fragment, useState } from "react";

import { Box, Button, Typography } from "@mui/material";
import {
  DescriptionOutlined,
  FolderOpenOutlined,
  ImageOutlined,
} from "@mui/icons-material";

import {
  CLOSING_NOTE,
  INTRO,
  LEGACY_CAVEAT,
  LEGACY_HEADING,
  LEGACY_NOTES,
  NOT_A_RULE,
  STANDARD_NAME,
  TIPS,
  TREE,
  TREE_TEXT,
} from "./content";

// The Folder Standard as it is DRAWN, shared by the Curator dialog and the
// public documentation page.
//
// Only the frame differs between them — a dialog there, a page here — so only
// the frame lives outside this file. Keeping the body shared is what makes
// "one source of truth" true of the rendering as well as of the words: a
// change to how a rule is presented lands in both places or in neither.

const iconFor = (kind) => {
  const sx = { fontSize: 16, mr: 0.75, flexShrink: 0 };
  if (kind === "folder") {
    return <FolderOpenOutlined sx={{ ...sx, color: "primary.main" }} />;
  }
  if (kind === "image") {
    return <ImageOutlined sx={{ ...sx, color: "secondary.main" }} />;
  }
  return <DescriptionOutlined sx={{ ...sx, color: "text.secondary" }} />;
};

export const FolderTree = () => (
  <Box
    data-testid="folder-guide-tree"
    sx={{
      border: 1,
      borderColor: "divider",
      borderRadius: 1,
      p: 1.5,
      bgcolor: "action.hover",
      overflowX: "auto",
    }}
  >
    {TREE.map((entry) => (
      <Box
        key={`${entry.depth}-${entry.name}`}
        sx={{
          display: "flex",
          alignItems: "center",
          pl: { xs: entry.depth * 1.25, sm: entry.depth * 2 },
          py: 0.15,
        }}
      >
        {iconFor(entry.kind)}
        <Typography
          variant="caption"
          sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}
        >
          {entry.name}
        </Typography>
      </Box>
    ))}
  </Box>
);

// The tree plus its copy action. Clipboard access is unavailable over plain
// HTTP and in some browsers, so failure is expected and gets a useful answer
// rather than a silent no-op.
export const FolderTreeWithCopy = () => {
  const [copyState, setCopyState] = useState("");

  const copyStructure = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(TREE_TEXT);
      setCopyState("Copied.");
    } catch (err) {
      setCopyState("Could not copy — select the tree above and copy it.");
    }
  };

  return (
    <Fragment>
      <Box
        sx={{
          mt: 2,
          mb: 1,
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="subtitle2">{STANDARD_NAME}</Typography>
        <Button size="small" onClick={copyStructure}>
          Copy standard structure
        </Button>
        {copyState ? (
          <Typography variant="caption" color="text.secondary">
            {copyState}
          </Typography>
        ) : null}
      </Box>
      <FolderTree />
    </Fragment>
  );
};

const Rules = ({ items, testId }) => (
  <Box component="ul" sx={{ pl: 3, mt: 2, mb: 0 }} data-testid={testId}>
    {items.map((item) => (
      <Typography component="li" variant="body2" key={item} sx={{ mb: 0.75 }}>
        {item}
      </Typography>
    ))}
  </Box>
);

/**
 * The whole standard: intro, tree with copy action, rules, and the separate
 * compatibility notes for folders that predate it.
 *
 * `headingLevel` lets the public page nest its headings under an <h1> while
 * the dialog keeps its own title element, without either one inventing a
 * second copy of the content to do it.
 */
const FolderStandardBody = ({ headingLevel = "h3" }) => (
  <Fragment>
    <Typography variant="body2" gutterBottom>
      {INTRO}
    </Typography>
    <Typography variant="body2" gutterBottom>
      {NOT_A_RULE}
    </Typography>

    <FolderTreeWithCopy />

    <Rules items={TIPS} testId="folder-guide-standard" />

    {/* Deliberately its own section: this is how an EXISTING folder is
        reviewed safely, not an alternative layout to aim for. */}
    <Typography
      variant="subtitle2"
      component={headingLevel}
      sx={{ mt: 3, mb: 0 }}
    >
      {LEGACY_HEADING}
    </Typography>
    <Typography
      variant="caption"
      color="text.secondary"
      display="block"
      sx={{ mb: 1 }}
    >
      {LEGACY_CAVEAT}
    </Typography>
    <Rules items={LEGACY_NOTES} testId="folder-guide-legacy" />

    <Typography
      variant="caption"
      color="text.secondary"
      display="block"
      sx={{ mt: 2 }}
    >
      {CLOSING_NOTE}
    </Typography>
  </Fragment>
);

export default FolderStandardBody;
