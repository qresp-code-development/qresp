import { Fragment, useContext, useEffect, useState } from "react";
import Link from "next/link";
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
  TextField,
  Typography,
} from "@mui/material";
import { EditNote, FolderOpen, WarningAmber } from "@mui/icons-material";

import SEO from "../../components/seo";
import AccountLayout from "../../components/Account/AccountLayout";
import AuthContext from "../../Context/Auth/authContext";
import { RegularStyledButton } from "../../components/button";
import {
  listServerDrafts,
  deleteServerDraft,
  updateServerDraft,
} from "../../Utils/serverDrafts";
import {
  summarizeBrowserDraft,
  clearBrowserDraft,
} from "../../Utils/browserDraft";

const formatDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleString();
};

const DraftsPage = () => {
  const { loading, authenticated } = useContext(AuthContext);

  const [drafts, setDrafts] = useState(null); // null = loading, [] = loaded
  const [draftError, setDraftError] = useState(null);
  const [localDraft, setLocalDraft] = useState(null);
  const [draftDialog, setDraftDialog] = useState(null); // {type:'rename'|'delete', id, title}
  const [draftSaving, setDraftSaving] = useState(false);

  // Load server drafts once authenticated
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    listServerDrafts()
      .then((items) => {
        if (!cancelled) setDrafts(items);
      })
      .catch(() => {
        if (!cancelled) {
          setDrafts([]);
          setDraftError("Failed to load account drafts.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  // Load browser draft (client-side only)
  useEffect(() => {
    setLocalDraft(summarizeBrowserDraft());
  }, []);

  // Actions
  const confirmDeleteDraft = async () => {
    if (!draftDialog || draftDialog.type !== "delete") return;
    const { id } = draftDialog;
    setDraftSaving(true);
    try {
      await deleteServerDraft(id);
      setDrafts((prev) => (prev || []).filter((d) => d.id !== id));
    } catch {
      // silently ignore; draft list stays unchanged
    } finally {
      setDraftSaving(false);
      setDraftDialog(null);
    }
  };

  const confirmRenameDraft = async () => {
    if (!draftDialog || draftDialog.type !== "rename") return;
    const { id, title } = draftDialog;
    setDraftSaving(true);
    try {
      await updateServerDraft(id, { title });
      setDrafts((prev) =>
        (prev || []).map((d) => (d.id === id ? { ...d, title } : d))
      );
    } catch {
      // silently ignore
    } finally {
      setDraftSaving(false);
      setDraftDialog(null);
    }
  };

  const clearLocalDraft = () => {
    clearBrowserDraft();
    setLocalDraft(null);
  };

  // ── Auth / loading guards ───────────────────────────────────────────────
  if (loading) {
    return (
      <Fragment>
        <SEO title="Qresp | My Drafts" />
        <AccountLayout pageTitle="My Drafts">
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <CircularProgress size={20} />
            <Typography color="text.secondary">Checking sign-in…</Typography>
          </Box>
        </AccountLayout>
      </Fragment>
    );
  }

  if (!authenticated) {
    return (
      <Fragment>
        <SEO title="Qresp | My Drafts" />
        <AccountLayout pageTitle="My Drafts">
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, maxWidth: 440 }}>
            <Typography variant="h6" gutterBottom>
              Please sign in.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Use &ldquo;Sign in&rdquo; in the header to access your drafts.
            </Typography>
          </Paper>
        </AccountLayout>
      </Fragment>
    );
  }

  // ── Server drafts section ───────────────────────────────────────────────
  let serverDraftsContent;

  if (drafts === null) {
    serverDraftsContent = (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 2 }}>
        <CircularProgress size={20} />
        <Typography color="text.secondary">Loading drafts…</Typography>
      </Box>
    );
  } else if (draftError) {
    serverDraftsContent = (
      <Typography color="error" variant="body2">
        {draftError}
      </Typography>
    );
  } else if (drafts.length === 0) {
    serverDraftsContent = (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          py: 7,
          gap: 1.5,
        }}
      >
        <EditNote sx={{ fontSize: 56, color: "text.disabled" }} />
        <Typography variant="h6" color="text.secondary">
          No account drafts yet.
        </Typography>
        <Typography variant="body2" color="text.disabled" textAlign="center">
          Start a new curation to create a draft.
        </Typography>
      </Box>
    );
  } else {
    serverDraftsContent = (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {drafts.map((draft) => (
          <Paper
            key={draft.id}
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 2.5,
              borderLeft: "3px solid #800000",
              display: "flex",
              alignItems: "flex-start",
              gap: 1.5,
              flexWrap: "wrap",
            }}
          >
            {/* Draft icon */}
            <Box sx={{ pt: 0.25, flexShrink: 0 }}>
              <FolderOpen sx={{ fontSize: 20, color: "#800000" }} />
            </Box>

            {/* Info */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={700} noWrap>
                {draft.title || "Untitled draft"}
              </Typography>
              {draft.updated_at && (
                <Typography variant="caption" color="text.secondary">
                  Last updated: {formatDate(draft.updated_at)}
                </Typography>
              )}
            </Box>

            {/* Actions */}
            <Box
              sx={{
                display: "flex",
                gap: 1,
                flexShrink: 0,
                mt: 0.25,
                flexWrap: "wrap",
              }}
            >
              <Button
                size="small"
                variant="outlined"
                component={Link}
                href={`/curator?draft=${encodeURIComponent(draft.id)}`}
                sx={{
                  borderColor: "#800000",
                  color: "#800000",
                  "&:hover": { borderColor: "#9a0000", color: "#9a0000" },
                }}
              >
                Resume
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() =>
                  setDraftDialog({
                    type: "rename",
                    id: draft.id,
                    title: draft.title || "",
                  })
                }
              >
                Rename
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() =>
                  setDraftDialog({ type: "delete", id: draft.id, title: draft.title })
                }
              >
                Delete
              </Button>
            </Box>
          </Paper>
        ))}
      </Box>
    );
  }

  // ── Local recovery draft section ────────────────────────────────────────
  let localDraftContent;

  if (!localDraft) {
    localDraftContent = (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        No local draft saved in this browser.
      </Typography>
    );
  } else {
    localDraftContent = (
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2.5,
          borderLeft: "3px solid #c07000",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1.5,
            flexWrap: "wrap",
          }}
        >
          {/* Warning icon */}
          <Box sx={{ pt: 0.25, flexShrink: 0 }}>
            <WarningAmber sx={{ fontSize: 20, color: "#c07000" }} />
          </Box>

          {/* Info */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={700} noWrap>
              {localDraft.title || "Untitled draft"}
            </Typography>
            {localDraft.sections && localDraft.sections.length > 0 && (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.75 }}>
                {localDraft.sections.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: "0.7rem", height: 20 }}
                  />
                ))}
              </Box>
            )}
            <Typography
              variant="caption"
              color="warning.main"
              sx={{ display: "block", mt: 0.75 }}
            >
              Stored only in this browser. Save to your account to access it elsewhere.
            </Typography>
          </Box>

          {/* Actions */}
          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexShrink: 0,
              mt: 0.25,
              flexWrap: "wrap",
            }}
          >
            <Button
              size="small"
              variant="outlined"
              component={Link}
              href="/curator?resumeDraft=1"
              sx={{
                borderColor: "#c07000",
                color: "#c07000",
                "&:hover": { borderColor: "#9a5500", color: "#9a5500" },
              }}
            >
              Resume
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={clearLocalDraft}
            >
              Clear
            </Button>
          </Box>
        </Box>
      </Paper>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Fragment>
      <SEO
        title="Qresp | My Drafts"
        description="Your saved curation drafts on Qresp"
        author="Qresp Team"
      />
      <AccountLayout pageTitle="My Drafts">
        {/* ── Account drafts ─────────────────────────────────────── */}
        <Box sx={{ mb: 5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <EditNote sx={{ fontSize: 20, color: "#800000" }} />
            <Typography variant="h6" fontWeight={700}>
              Account drafts
            </Typography>
            {drafts && drafts.length > 0 && (
              <Chip
                label={drafts.length}
                size="small"
                sx={{ ml: 0.5, bgcolor: "#800000", color: "#fff", fontWeight: 700 }}
              />
            )}
          </Box>
          <Divider sx={{ mb: 2 }} />
          {serverDraftsContent}
        </Box>

        {/* ── Local recovery draft ───────────────────────────────── */}
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <WarningAmber sx={{ fontSize: 20, color: "#c07000" }} />
            <Typography variant="h6" fontWeight={700}>
              Local recovery draft
            </Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          {localDraftContent}
        </Box>
      </AccountLayout>

      {/* ── Rename dialog ─────────────────────────────────────────── */}
      <Dialog
        open={Boolean(draftDialog && draftDialog.type === "rename")}
        onClose={() => setDraftDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Rename draft</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Draft title"
            value={draftDialog?.title || ""}
            onChange={(e) =>
              setDraftDialog((prev) => ({ ...prev, title: e.target.value }))
            }
            sx={{ mt: 1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !draftSaving) confirmRenameDraft();
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDraftDialog(null)} disabled={draftSaving}>
            Cancel
          </Button>
          <RegularStyledButton
            variant="contained"
            onClick={confirmRenameDraft}
            disabled={draftSaving || !draftDialog?.title?.trim()}
          >
            {draftSaving ? "Saving…" : "Save"}
          </RegularStyledButton>
        </DialogActions>
      </Dialog>

      {/* ── Delete dialog ─────────────────────────────────────────── */}
      <Dialog
        open={Boolean(draftDialog && draftDialog.type === "delete")}
        onClose={() => setDraftDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete draft?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &ldquo;
            {draftDialog?.title || "this draft"}&rdquo;? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDraftDialog(null)} disabled={draftSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDeleteDraft}
            disabled={draftSaving}
          >
            {draftSaving ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Fragment>
  );
};

export default DraftsPage;
