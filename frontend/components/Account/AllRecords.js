import { Fragment, useEffect, useState } from "react";

import axios from "axios";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { LockOutlined } from "@mui/icons-material";
import Link from "next/link";

import { getServer } from "../../Utils/utils";

// Admin-only COMPLETE management surface over GET /api/admin/papers: every
// stored record (active, deactivated, ownerless, other users') with reassign
// owner / manage editors / deactivate-reactivate actions. The separate
// "Ownerless records (admin)" drawer stays as a focused migration helper —
// it carries the curator-declared owner SUGGESTION this full list does not.
// All permission checks are enforced server-side; this is a convenience view.

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};

const AllRecords = () => {
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");
  // One dialog for every row action:
  // { type: "owner"|"editors"|"deactivate"|"reactivate", id, title, value?, error? }
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/api/admin/papers")
      .then((res) => {
        if (!cancelled) setRecords(res.data.papers || []);
      })
      .catch(() => {
        if (!cancelled) {
          setRecords([]);
          setError("Could not load the records.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patchRecord = (id, patch) =>
    setRecords((items) =>
      (items || []).map((record) =>
        record.id === id ? { ...record, ...patch } : record
      )
    );

  const closeDialog = () => {
    setDialog(null);
    setSaving(false);
  };

  const failDialog = (err, fallback) => {
    const res = err.response;
    setSaving(false);
    setDialog((current) =>
      current
        ? {
            ...current,
            error: (res && res.data && res.data.error) || fallback,
          }
        : current
    );
  };

  const confirmReassignOwner = () => {
    const { id, value } = dialog;
    const email = (value || "").trim();
    if (!email) {
      setDialog((current) => ({
        ...current,
        error: "Enter an owner email first.",
      }));
      return;
    }
    setSaving(true);
    // force: this dialog is the deliberate reassignment path; the 409 guard
    // on the API protects against accidental overwrites elsewhere.
    axios
      .put(`/api/paper/${encodeURIComponent(id)}/owner`, {
        owner_email: email,
        force: true,
      })
      .then((res) => {
        patchRecord(id, { owner_email: res.data.owner_email });
        closeDialog();
      })
      .catch((err) =>
        failDialog(err, "Reassigning the owner failed, please try again.")
      );
  };

  const confirmSetEditors = () => {
    const { id, value } = dialog;
    const editors = (value || "")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
    setSaving(true);
    axios
      .put(`/api/paper/${encodeURIComponent(id)}/editors`, {
        editor_emails: editors,
      })
      .then((res) => {
        patchRecord(id, { editor_emails: res.data.editor_emails });
        closeDialog();
      })
      .catch((err) =>
        failDialog(err, "Could not update the editors. Please try again.")
      );
  };

  const confirmSetActive = () => {
    const { id, type } = dialog;
    const active = type === "reactivate";
    setSaving(true);
    axios
      .put(`/api/paper/${encodeURIComponent(id)}/active`, { active })
      .then(() => {
        patchRecord(id, { is_active: active });
        closeDialog();
      })
      .catch((err) =>
        failDialog(
          err,
          active
            ? "Could not reactivate this record. Please try again."
            : "Could not deactivate this record. Please try again."
        )
      );
  };

  const origin = typeof window === "undefined" ? "" : getServer();

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }
  if (records === null) {
    return <Typography color="secondary">Loading records...</Typography>;
  }
  if (records.length === 0) {
    return <Typography color="secondary">No records in the database.</Typography>;
  }

  return (
    <Fragment>
      <Typography variant="body2" color="secondary" sx={{ mb: 2 }}>
        Every record on this server, including deactivated and other
        users&rsquo; records. Deactivation hides a record from the public but
        never deletes it.
      </Typography>
      {records.map((record) => {
        const deactivated = record.is_active === false;
        return (
          <Box
            key={record.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 2,
              flexWrap: "wrap",
            }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 220 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography color="secondary">
                  {record.title || "Untitled record"}
                  {record.year ? ` (${record.year})` : ""}
                </Typography>
                {record.owner_email ? null : (
                  <Chip label="ownerless" size="small" color="default" />
                )}
                {deactivated ? (
                  <Chip label="deactivated" size="small" color="default" />
                ) : null}
                {record.is_private === true ? (
                  <Chip icon={<LockOutlined />} label="Private" size="small" variant="outlined" />
                ) : null}
              </Box>
              <Typography variant="body2" color="secondary">
                {record.authors}
              </Typography>
              <Typography variant="body2" color="secondary">
                Owner: {record.owner_email || "none"}
                {(record.editor_emails || []).length > 0
                  ? ` — Editors: ${record.editor_emails.join(", ")}`
                  : ""}
              </Typography>
              {record.updated_at ? (
                <Typography variant="body2" color="secondary">
                  Updated {formatDate(record.updated_at)}
                  {record.updated_by_email
                    ? ` by ${record.updated_by_email}`
                    : ""}
                </Typography>
              ) : null}
            </Box>
            {/* Deactivated records 404 on the public detail route (SSR is
                anonymous), so no View link for them. */}
            {deactivated ? null : (
              <Button
                size="small"
                variant="outlined"
                component={Link}
                href={`/paperdetails/${encodeURIComponent(
                  record.id
                )}?server=${encodeURIComponent(origin)}`}
              >
                View
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              component={Link}
              href={`/curator?edit=${encodeURIComponent(
                record.id
              )}&server=${encodeURIComponent(origin)}`}
            >
              Edit in Curator
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() =>
                setDialog({
                  type: "editors",
                  id: record.id,
                  title: record.title || "this record",
                  value: (record.editor_emails || []).join(", "),
                })
              }
            >
              Editors
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() =>
                setDialog({
                  type: "owner",
                  id: record.id,
                  title: record.title || "this record",
                  value: record.owner_email || "",
                })
              }
            >
              Reassign Owner
            </Button>
            {deactivated ? (
              <Button
                size="small"
                variant="outlined"
                color="primary"
                onClick={() =>
                  setDialog({
                    type: "reactivate",
                    id: record.id,
                    title: record.title || "this record",
                  })
                }
              >
                Reactivate
              </Button>
            ) : (
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() =>
                  setDialog({
                    type: "deactivate",
                    id: record.id,
                    title: record.title || "this record",
                  })
                }
              >
                Deactivate
              </Button>
            )}
          </Box>
        );
      })}

      <Dialog
        open={Boolean(dialog)}
        onClose={closeDialog}
        fullWidth
        maxWidth="xs"
      >
        {dialog && dialog.type === "owner" ? (
          <Fragment>
            <DialogTitle>Reassign record owner</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="secondary" gutterBottom>
                The new owner becomes able to edit and manage &ldquo;
                {dialog.title}&rdquo;. The previous owner loses edit access
                unless they are listed as an editor.
              </Typography>
              <TextField
                autoFocus
                label="Owner email"
                value={dialog.value || ""}
                onChange={(e) =>
                  setDialog((current) => ({
                    ...current,
                    value: e.target.value,
                  }))
                }
                fullWidth
                margin="dense"
                variant="outlined"
              />
              {dialog.error ? (
                <Typography variant="body2" color="error">
                  {dialog.error}
                </Typography>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={closeDialog}>Cancel</Button>
              <Button
                onClick={confirmReassignOwner}
                variant="contained"
                disabled={saving}
              >
                Reassign
              </Button>
            </DialogActions>
          </Fragment>
        ) : dialog && dialog.type === "editors" ? (
          <Fragment>
            <DialogTitle>Editors</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="secondary" gutterBottom>
                Editors can edit &ldquo;{dialog.title}&rdquo; but cannot
                deactivate it or change this list.
              </Typography>
              <TextField
                autoFocus
                label="Editor emails"
                value={dialog.value || ""}
                onChange={(e) =>
                  setDialog((current) => ({
                    ...current,
                    value: e.target.value,
                  }))
                }
                fullWidth
                margin="dense"
                variant="outlined"
                helperText="Comma-separated email addresses. Leave empty to remove all editors."
              />
              {dialog.error ? (
                <Typography variant="body2" color="error">
                  {dialog.error}
                </Typography>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={closeDialog}>Cancel</Button>
              <Button
                onClick={confirmSetEditors}
                variant="contained"
                disabled={saving}
              >
                Save
              </Button>
            </DialogActions>
          </Fragment>
        ) : dialog ? (
          <Fragment>
            <DialogTitle>
              {dialog.type === "reactivate"
                ? "Reactivate this record?"
                : "Deactivate this record?"}
            </DialogTitle>
            <DialogContent>
              <Typography color="secondary">
                {dialog.type === "reactivate"
                  ? `“${dialog.title}” will become publicly visible again in search, the explorer and its detail page.`
                  : `“${dialog.title}” will be hidden from public search, the explorer and its detail page. It is not deleted — it can be reactivated at any time.`}
              </Typography>
              {dialog.error ? (
                <Typography variant="body2" color="error">
                  {dialog.error}
                </Typography>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={closeDialog}>Cancel</Button>
              <Button
                onClick={confirmSetActive}
                variant="contained"
                color={dialog.type === "reactivate" ? "primary" : "error"}
                disabled={saving}
              >
                {dialog.type === "reactivate" ? "Reactivate" : "Deactivate"}
              </Button>
            </DialogActions>
          </Fragment>
        ) : null}
      </Dialog>
    </Fragment>
  );
};

export default AllRecords;
