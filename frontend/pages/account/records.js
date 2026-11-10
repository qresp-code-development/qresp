import { Fragment, useContext, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  Article,
  DeleteForever,
  Edit,
  EditNoteOutlined,
  LockOutlined,
  OpenInNew,
  PeopleOutlined,
  ShareOutlined,
  ToggleOff,
  ToggleOn,
} from "@mui/icons-material";

import SEO from "../../components/seo";
import AccountLayout from "../../components/Account/AccountLayout";
import OwnerlessRecords from "../../components/Account/OwnerlessRecords";
import AllRecords from "../../components/Account/AllRecords";
import SharingDialog from "../../components/Sharing/SharingDialog";
import ShareButton from "../../components/Sharing/ShareButton";
import AuthContext from "../../Context/Auth/authContext";
import { getServer } from "../../Utils/utils";

const formatDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleString();
};

const RecordsPage = () => {
  const { loading, authenticated, user } = useContext(AuthContext);
  const [papers, setPapers] = useState(null);
  const [recordDialog, setRecordDialog] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordError, setRecordError] = useState("");
  const [sharingPaper, setSharingPaper] = useState(null);
  // "mine": records the user owns or edits. "shared": records shared with
  // them read-only (role "viewer"). The backend marks the role per record.
  const [tab, setTab] = useState("mine");
  const origin = typeof window === "undefined" ? "" : getServer();

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    axios
      .get("/api/account/papers")
      .then((res) => { if (!cancelled) setPapers(res.data.papers || []); })
      .catch(() => { if (!cancelled) setPapers([]); });
    return () => { cancelled = true; };
  }, [authenticated]);

  const closeDialog = () => { setRecordDialog(null); setRecordSaving(false); };

  const confirmSetActive = () => {
    const { id, type } = recordDialog;
    const active = type === "reactivate";
    setRecordSaving(true);
    setRecordError("");
    axios
      .put(`/api/paper/${encodeURIComponent(id)}/active`, { active })
      .then(() => {
        setPapers((items) =>
          (items || []).map((p) => p.id === id ? { ...p, is_active: active } : p)
        );
        closeDialog();
      })
      .catch(() => {
        setRecordError(active ? "Could not reactivate. Please try again." : "Could not deactivate. Please try again.");
        closeDialog();
      });
  };

  // Permanent, unlike deactivation. The dialog asks for the word "delete"
  // so a slipped click cannot remove a record.
  const confirmDelete = () => {
    const { id } = recordDialog;
    setRecordSaving(true);
    setRecordError("");
    axios
      .delete(`/api/paper/${encodeURIComponent(id)}`)
      .then(() => {
        setPapers((items) => (items || []).filter((p) => p.id !== id));
        closeDialog();
      })
      .catch((err) => {
        const msg = err?.response?.data?.error || "Could not delete. Please try again.";
        setRecordSaving(false);
        setRecordDialog((cur) => cur ? { ...cur, error: msg } : cur);
      });
  };

  // Visibility and the collaborator list are saved together: a private
  // record and the people who may read it are one decision for the owner.
  const saveSharing = async ({ isPrivate, viewers, editors }) => {
    const id = sharingPaper.id;
    try {
      const res = await axios.put(`/api/paper/${encodeURIComponent(id)}/visibility`, {
        is_private: isPrivate,
        viewer_emails: viewers,
        editor_emails: editors,
      });
      setPapers((items) =>
        (items || []).map((p) =>
          p.id === id
            ? {
                ...p,
                is_private: res.data.is_private,
                viewer_emails: res.data.viewer_emails,
                editor_emails: res.data.editor_emails,
              }
            : p
        )
      );
      setSharingPaper(null);
    } catch (err) {
      throw new Error(err?.response?.data?.error || "Could not update sharing. Please try again.");
    }
  };

  const mine = papers ? papers.filter((p) => p.role !== "viewer") : null;
  const shared = papers ? papers.filter((p) => p.role === "viewer") : null;
  const visible = (tab === "mine" ? mine : shared) || [];

  let content;
  if (loading) {
    content = (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  } else if (!authenticated) {
    content = (
      <Typography color="text.secondary">Please sign in.</Typography>
    );
  } else {
    content = (
      <Fragment>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1,
            mb: 2,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Tabs
            value={tab}
            onChange={(_, next) => setTab(next)}
            aria-label="Which records to show"
            sx={{ minHeight: 44 }}
          >
            <Tab
              value="mine"
              icon={<EditNoteOutlined fontSize="small" />}
              iconPosition="start"
              label={`Owned & editing${mine ? ` (${mine.length})` : ""}`}
              data-testid="records-tab-mine"
              sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }}
            />
            <Tab
              value="shared"
              icon={<ShareOutlined fontSize="small" />}
              iconPosition="start"
              label={`Shared with me${shared ? ` (${shared.length})` : ""}`}
              data-testid="records-tab-shared"
              sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }}
            />
          </Tabs>
          <Button
            variant="contained"
            startIcon={<Add />}
            component={Link}
            href="/curator"
            sx={{ bgcolor: "#800000", "&:hover": { bgcolor: "#600000" } }}
          >
            New record
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {tab === "mine"
            ? "Records you published, and records where someone added you as an editor."
            : "Private records other people shared with you to view. You can open them but not edit them."}
        </Typography>

        {recordError && (
          <Typography color="error" sx={{ mb: 2 }}>{recordError}</Typography>
        )}

        {papers === null ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
            <CircularProgress />
          </Box>
        ) : visible.length === 0 ? (
          <Box sx={{ textAlign: "center", mt: 8 }}>
            {tab === "mine" ? (
              <Article sx={{ fontSize: 56, color: "text.disabled", mb: 1.5 }} />
            ) : (
              <ShareOutlined sx={{ fontSize: 56, color: "text.disabled", mb: 1.5 }} />
            )}
            <Typography color="text.secondary">
              {tab === "mine"
                ? "No published records yet."
                : "Nothing has been shared with you yet."}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {visible.map((paper) => {
              const deactivated = paper.is_active === false;
              const isPrivate = paper.is_private === true;
              const canManage = user.is_admin || (paper.role !== "editor" && paper.role !== "viewer");
              const canEdit = user.is_admin || paper.role !== "viewer";
              // Everyone with access besides the owner. Viewers count only
              // while private: a public record is open to all anyway.
              const people = [
                ...(paper.editor_emails || []).map((email) => ({ email, role: "editor" })),
                ...(isPrivate ? paper.viewer_emails || [] : [])
                  .filter((email) => !(paper.editor_emails || []).includes(email))
                  .map((email) => ({ email, role: "viewer" })),
              ];
              return (
                <Paper
                  key={paper.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    opacity: deactivated ? 0.65 : 1,
                    borderLeft: deactivated ? "3px solid #bbb" : "3px solid #800000",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, flexWrap: "wrap" }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mb: 0.25 }}>
                        <Typography fontWeight={700} noWrap sx={{ maxWidth: "100%" }}>
                          {paper.title}{paper.year ? ` (${paper.year})` : ""}
                        </Typography>
                        {paper.role === "editor" && (
                          <Chip label="editor" size="small" variant="outlined" />
                        )}
                        {paper.role === "viewer" && (
                          <Chip label="shared with you" size="small" variant="outlined" />
                        )}
                        {isPrivate && (
                          <Chip
                            icon={<LockOutlined />}
                            label="Private"
                            size="small"
                            variant="outlined"
                            data-testid="record-private-chip"
                          />
                        )}
                        {canManage && people.length > 0 && (
                          <Tooltip
                            title={people.map((p) => `${p.email} (${p.role})`).join(", ")}
                          >
                            <Chip
                              icon={<PeopleOutlined />}
                              label={`Shared with ${people.length}`}
                              size="small"
                              variant="outlined"
                              data-testid="record-collaborators-chip"
                            />
                          </Tooltip>
                        )}
                        {deactivated && (
                          <Chip label="deactivated" size="small" color="default" />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {paper.authors}
                      </Typography>
                      {paper.updated_at && (
                        <Typography variant="caption" color="text.secondary">
                          Updated {formatDate(paper.updated_at)}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", flexShrink: 0 }}>
                      {!deactivated && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<OpenInNew fontSize="inherit" />}
                          component={Link}
                          href={`/paperdetails/${encodeURIComponent(paper.id)}?server=${encodeURIComponent(origin)}`}
                        >
                          View
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Edit fontSize="inherit" />}
                          component={Link}
                          href={`/curator?edit=${encodeURIComponent(paper.id)}&server=${encodeURIComponent(origin)}`}
                        >
                          Edit in Curator
                        </Button>
                      )}
                      {canManage && (
                        <ShareButton
                          isPrivate={isPrivate}
                          testId="record-sharing"
                          onClick={() => setSharingPaper(paper)}
                        />
                      )}
                      {canManage && (
                        deactivated ? (
                          <Button
                            size="small"
                            variant="outlined"
                            color="primary"
                            startIcon={<ToggleOn fontSize="inherit" />}
                            onClick={() =>
                              setRecordDialog({ type: "reactivate", id: paper.id, title: paper.title || "this record" })
                            }
                          >
                            Reactivate
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<ToggleOff fontSize="inherit" />}
                            onClick={() =>
                              setRecordDialog({ type: "deactivate", id: paper.id, title: paper.title || "this record" })
                            }
                          >
                            Deactivate
                          </Button>
                        )
                      )}
                      {canManage && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          data-testid="record-delete"
                          startIcon={<DeleteForever fontSize="inherit" />}
                          onClick={() =>
                            setRecordDialog({ type: "delete", id: paper.id, title: paper.title || "this record", value: "" })
                          }
                        >
                          Delete
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        )}

        {/* Admin sections */}
        {user.is_admin && (
          <Fragment>
            <Divider sx={{ my: 4 }} />
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Admin — Ownerless records
            </Typography>
            <OwnerlessRecords />
            <Divider sx={{ my: 4 }} />
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Admin — All records
            </Typography>
            <AllRecords />
          </Fragment>
        )}

        {/* Dialogs */}
        <SharingDialog
          open={Boolean(sharingPaper)}
          onClose={() => setSharingPaper(null)}
          recordTitle={sharingPaper?.title || ""}
          initialPrivate={sharingPaper?.is_private === true}
          initialViewers={sharingPaper?.viewer_emails || []}
          initialEditors={sharingPaper?.editor_emails || []}
          onSave={saveSharing}
        />
        <Dialog open={Boolean(recordDialog)} onClose={closeDialog} fullWidth maxWidth="xs">
          {recordDialog?.type === "delete" ? (
            <Fragment>
              <DialogTitle>Delete record permanently?</DialogTitle>
              <DialogContent>
                <Typography color="text.secondary" gutterBottom>
                  &ldquo;{recordDialog.title}&rdquo; will be removed from Qresp for good, along with its
                  favorites. This cannot be undone. To hide it but keep it, use Deactivate instead.
                </Typography>
                <TextField
                  autoFocus
                  label='Type "delete" to confirm'
                  value={recordDialog.value || ""}
                  onChange={(e) =>
                    setRecordDialog((cur) => ({ ...cur, value: e.target.value }))
                  }
                  fullWidth
                  margin="dense"
                  slotProps={{ htmlInput: { "data-testid": "record-delete-confirm-input" } }}
                />
                {recordDialog.error && (
                  <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                    {recordDialog.error}
                  </Typography>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={closeDialog}>Cancel</Button>
                <Button
                  onClick={confirmDelete}
                  variant="contained"
                  color="error"
                  data-testid="record-delete-confirm"
                  disabled={recordSaving || (recordDialog.value || "").trim().toLowerCase() !== "delete"}
                >
                  Delete
                </Button>
              </DialogActions>
            </Fragment>
          ) : recordDialog ? (
            <Fragment>
              <DialogTitle>
                {recordDialog.type === "reactivate" ? "Reactivate record?" : "Deactivate record?"}
              </DialogTitle>
              <DialogContent>
                <Typography color="text.secondary">
                  {recordDialog.type === "reactivate"
                    ? `"${recordDialog.title}" will become publicly visible again.`
                    : `"${recordDialog.title}" will be hidden from public search and the explorer. It is not deleted — you can reactivate it at any time.`}
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button onClick={closeDialog}>Cancel</Button>
                <Button
                  onClick={confirmSetActive}
                  variant="contained"
                  color={recordDialog.type === "reactivate" ? "primary" : "error"}
                  disabled={recordSaving}
                >
                  {recordDialog.type === "reactivate" ? "Reactivate" : "Deactivate"}
                </Button>
              </DialogActions>
            </Fragment>
          ) : null}
        </Dialog>
      </Fragment>
    );
  }

  return (
    <Fragment>
      <SEO
        title="Qresp | My Published Records"
        description="Manage your published Qresp records"
        author="Qresp Team"
      />
      <AccountLayout pageTitle="My Published Records">{content}</AccountLayout>
    </Fragment>
  );
};

export default RecordsPage;
