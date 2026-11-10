import { Fragment, useCallback, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";

import axios from "axios";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { LockOutlined } from "@mui/icons-material";
import Link from "next/link";
import Router from "next/router";

import AuthContext from "../../Context/Auth/authContext";
import SharingDialog from "../Sharing/SharingDialog";
import ShareButton from "../Sharing/ShareButton";

// Backend-driven edit-permission indicator. The decision comes from
// GET /api/paper/{id}/permissions (never frontend-only logic). Editing goes
// through the curator in edit mode — one single edit path; the backend gates
// /raw and PUT the same way, so this link grants nothing by itself.
// Admins additionally get a minimal "Assign owner" dialog on OWNERLESS
// legacy records (PUT /api/paper/{id}/owner is admin-gated server-side).
const PermissionNotice = ({ paperId, server }) => {
  const { authenticated, loading } = useContext(AuthContext);
  const [permissions, setPermissions] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEmail, setAssignEmail] = useState("");
  const [assignMessage, setAssignMessage] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [activeOpen, setActiveOpen] = useState(false);
  const [activeMessage, setActiveMessage] = useState("");
  const [activeSaving, setActiveSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await axios.get(
        `/api/paper/${encodeURIComponent(paperId)}/permissions`
      );
      setPermissions(res.data);
    } catch (err) {
      // Previews/unknown ids or older backends: show nothing.
      setPermissions(null);
    }
  }, [paperId]);

  useEffect(() => {
    if (!paperId || loading) return undefined;
    let cancelled = false;
    fetchPermissions().then(() => {
      if (cancelled) return undefined;
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [paperId, authenticated, loading, fetchPermissions]);

  if (!permissions) return null;

  const assignOwner = async () => {
    setAssigning(true);
    setAssignMessage("");
    try {
      await axios.put(`/api/paper/${encodeURIComponent(paperId)}/owner`, {
        owner_email: assignEmail,
      });
      setAssignOpen(false);
      setAssignEmail("");
      await fetchPermissions();
    } catch (err) {
      const res = err.response;
      setAssignMessage(
        (res && res.data && res.data.error) ||
          "Assigning the owner failed, please try again."
      );
    }
    setAssigning(false);
  };

  const isActive = permissions.is_active !== false;

  const setActive = async (active) => {
    setActiveSaving(true);
    setActiveMessage("");
    try {
      await axios.put(`/api/paper/${encodeURIComponent(paperId)}/active`, {
        active,
      });
      setActiveOpen(false);
      await fetchPermissions();
    } catch (err) {
      const res = err.response;
      setActiveMessage(
        (res && res.data && res.data.error) ||
          "Updating this record failed, please try again."
      );
    }
    setActiveSaving(false);
  };

  const isPrivate = permissions.is_private === true;

  const saveSharing = async ({ isPrivate: nextPrivate, viewers, editors }) => {
    try {
      await axios.put(`/api/paper/${encodeURIComponent(paperId)}/visibility`, {
        is_private: nextPrivate,
        viewer_emails: viewers,
        editor_emails: editors,
      });
    } catch (err) {
      const res = err.response;
      throw new Error(
        (res && res.data && res.data.error) ||
          "Updating sharing failed, please try again."
      );
    }
    setSharingOpen(false);
    await fetchPermissions();
  };

  // Permanent, unlike deactivation; the record page no longer exists after
  // it, so the owner is sent back to their records list.
  const deleteRecord = async () => {
    setDeleting(true);
    setDeleteMessage("");
    try {
      await axios.delete(`/api/paper/${encodeURIComponent(paperId)}`);
      setDeleteOpen(false);
      Router.push("/account/records");
    } catch (err) {
      const res = err.response;
      setDeleteMessage(
        (res && res.data && res.data.error) ||
          "Deleting this record failed, please try again."
      );
      setDeleting(false);
    }
  };

  let text;
  if (permissions.can_edit) {
    text = `You can edit this record (${permissions.reason})`;
  } else if (!permissions.authenticated) {
    text = "Sign in to edit this record";
  } else {
    text = "Only the record owner, an editor, or an admin can edit this record";
  }

  const showAssignOwner = permissions.is_admin && !permissions.owner_email;
  // Deactivation is a MANAGE action (owner/admin): editors can edit the
  // record but never hide/unhide it. The backend enforces the same rule.
  const canManage = permissions.can_manage === true;

  return (
    <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <Typography variant="subtitle2" color="secondary">
        {text}
      </Typography>
      {permissions.can_edit && !isActive ? (
        <Typography variant="subtitle2" color="error">
          This record is deactivated: it is hidden from public search and its
          detail page. Only you and admins can see it.
        </Typography>
      ) : null}
      {isActive && isPrivate ? (
        <Typography
          variant="subtitle2"
          color="secondary"
          data-testid="private-notice"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
        >
          <LockOutlined fontSize="inherit" />
          {permissions.role === "viewer"
            ? "This private record has been shared with you. It is hidden from public search."
            : "This record is private: it is hidden from public search and only the people it is shared with can open it."}
        </Typography>
      ) : null}
      {permissions.can_edit ? (
        <Button
          size="small"
          variant="outlined"
          component={Link}
          href={`/curator?edit=${encodeURIComponent(
            paperId
          )}&server=${encodeURIComponent(server || "")}`}
        >
          Edit in Curator
        </Button>
      ) : null}
      {canManage ? (
        <Fragment>
          <ShareButton
            isPrivate={isPrivate}
            testId="paper-sharing"
            onClick={() => setSharingOpen(true)}
          />
          <SharingDialog
            open={sharingOpen}
            onClose={() => setSharingOpen(false)}
            initialPrivate={isPrivate}
            initialViewers={permissions.viewer_emails || []}
            initialEditors={permissions.editor_emails || []}
            onSave={saveSharing}
          />
          <Button
            size="small"
            variant="outlined"
            color={isActive ? "error" : "primary"}
            onClick={() => {
              setActiveMessage("");
              setActiveOpen(true);
            }}
          >
            {isActive ? "Deactivate" : "Reactivate"}
          </Button>
          <Dialog
            open={activeOpen}
            onClose={() => setActiveOpen(false)}
            fullWidth
            maxWidth="xs"
          >
            <DialogTitle>
              {isActive ? "Deactivate this record?" : "Reactivate this record?"}
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="secondary" gutterBottom>
                {isActive
                  ? "Deactivating hides this record from public search, the explorer and its detail page. Nothing is deleted, and you can reactivate it at any time."
                  : "Reactivating makes this record public again: it will reappear in search, the explorer and its detail page."}
              </Typography>
              {activeMessage ? (
                <Typography variant="body2" color="error">
                  {activeMessage}
                </Typography>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setActiveOpen(false)}>Cancel</Button>
              <Button
                onClick={() => setActive(!isActive)}
                variant="contained"
                color={isActive ? "error" : "primary"}
                disabled={activeSaving}
              >
                {isActive ? "Deactivate" : "Reactivate"}
              </Button>
            </DialogActions>
          </Dialog>
          <Button
            size="small"
            variant="outlined"
            color="error"
            data-testid="paper-delete"
            onClick={() => {
              setDeleteConfirm("");
              setDeleteMessage("");
              setDeleteOpen(true);
            }}
          >
            Delete
          </Button>
          <Dialog
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            fullWidth
            maxWidth="xs"
          >
            <DialogTitle>Delete this record permanently?</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="secondary" gutterBottom>
                The record is removed from Qresp for good, along with its
                favorites. This cannot be undone. To hide it but keep it, use
                Deactivate instead.
              </Typography>
              <TextField
                autoFocus
                label='Type "delete" to confirm'
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                fullWidth
                margin="dense"
                slotProps={{ htmlInput: { "data-testid": "paper-delete-confirm-input" } }}
              />
              {deleteMessage ? (
                <Typography variant="body2" color="error">
                  {deleteMessage}
                </Typography>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button
                onClick={deleteRecord}
                variant="contained"
                color="error"
                data-testid="paper-delete-confirm"
                disabled={deleting || deleteConfirm.trim().toLowerCase() !== "delete"}
              >
                Delete
              </Button>
            </DialogActions>
          </Dialog>
        </Fragment>
      ) : null}
      {showAssignOwner ? (
        <Fragment>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setAssignOpen(true)}
          >
            Assign owner
          </Button>
          <Dialog
            open={assignOpen}
            onClose={() => setAssignOpen(false)}
            fullWidth
            maxWidth="xs"
          >
            <DialogTitle>Assign record owner</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="secondary" gutterBottom>
                This legacy record has no verified owner yet. The assigned
                account becomes able to edit it.
              </Typography>
              <TextField
                label="Owner email"
                value={assignEmail}
                onChange={(e) => setAssignEmail(e.target.value)}
                fullWidth
                margin="dense"
                variant="outlined"
              />
              {assignMessage ? (
                <Typography variant="body2" color="error">
                  {assignMessage}
                </Typography>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setAssignOpen(false)}>Cancel</Button>
              <Button
                onClick={assignOwner}
                variant="contained"
                disabled={assigning}
              >
                Assign
              </Button>
            </DialogActions>
          </Dialog>
        </Fragment>
      ) : null}
    </Box>
  );
};

PermissionNotice.propTypes = {
  paperId: PropTypes.string,
  server: PropTypes.string,
};

export default PermissionNotice;
