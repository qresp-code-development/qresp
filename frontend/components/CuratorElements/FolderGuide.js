import { Fragment, useState } from "react";

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link as MuiLink,
} from "@mui/material";

import FolderStandardBody from "../FolderStandard/FolderStandardBody";

// "How to organize an RCC folder" — the Qresp Folder Standard v1, offered to
// a curator at the moment they are pointing Qresp at a folder.
//
// The standard itself lives in components/FolderStandard, because the same
// guidance is published at /documentation/folder-standard for researchers who
// are laying a folder out BEFORE they ever open the Curator. This file is only
// the dialog around it: the content, the tree and the copy action are the
// shared ones, so the two surfaces cannot describe different layouts.

const FolderGuide = () => {
  const [open, setOpen] = useState(false);

  return (
    <Fragment>
      <Button
        size="small"
        onClick={() => setOpen(true)}
        sx={{ whiteSpace: "nowrap" }}
      >
        How to organize an RCC folder
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>How to organize an RCC folder</DialogTitle>
        <DialogContent dividers>
          <FolderStandardBody />
          {/* The same guidance has a public URL, which is the one to send to
              a collaborator who is not a curator on this server. */}
          <Box sx={{ mt: 2 }}>
            <MuiLink
              href="/documentation/folder-standard"
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              variant="caption"
              data-testid="folder-guide-public-link"
            >
              Open the public Folder Standard page
            </MuiLink>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Fragment>
  );
};

export default FolderGuide;
