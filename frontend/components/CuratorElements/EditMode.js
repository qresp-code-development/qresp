import { Fragment, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";

import axios from "axios";
import { Box, Typography } from "@mui/material";
import { useRouter } from "next/router";

import { RegularStyledButton } from "../button";
import {
  convertReqSchematoState,
  convertStateToUpdatePayload,
} from "../../Utils/model";
import { validate } from "./Publish";

import AuthContext from "../../Context/Auth/authContext";
import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import ServerContext from "../../Context/Servers/serverContext";
import AlertContext from "../../Context/Alert/alertContext";
import LoadingContext from "../../Context/Loading/loadingContext";

// Owner/admin full-record editing through the EXISTING curator forms (Qresp
// 2.0). EditModeController gates on the backend permission decision (never
// frontend-only logic), loads the stored document via /api/paper/{id}/raw
// into the existing curator state, and swaps the publish flow for a Save
// Changes action that PUTs back to the same record. The session CSRF token
// rides on the axios interceptor from AuthState.

const backToPaperHref = (editId, server) =>
  `/paperdetails/${encodeURIComponent(editId)}?server=${encodeURIComponent(
    server || ""
  )}`;

// Where to go after saving/cancelling an edit. Deactivated records are hidden
// from the public detail route (SSR fetches anonymously and 404s), so we send
// the owner back to /account — their management surface — instead of a broken
// detail page. Active records return to their detail page as before.
const afterEditHref = (editId, server, originalDoc) =>
  originalDoc && originalDoc.is_active === false
    ? "/account"
    : backToPaperHref(editId, server);

const SaveChangesBar = ({ editId, server, originalDoc }) => {
  const { metadata, collectDraftState } = useContext(CuratorContext);
  const { editing } = useContext(CuratorHelperContext);
  const { selectedHttp } = useContext(ServerContext);
  const { setAlert } = useContext(AlertContext);
  const { showLoader, hideLoader } = useContext(LoadingContext);
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    // Sections still open are saved with what is typed in them; nothing is
    // required (see Publish.validate).
    const payload = convertStateToUpdatePayload(
      collectDraftState ? collectDraftState() : metadata,
      originalDoc,
      selectedHttp
    );
    const isValid = validate(editing, payload);
    if (!isValid.valid) {
      setAlert(
        "Something's Missing",
        <Fragment>
          {isValid.errors.map((el, i) => (
            <div key={i}>{el}</div>
          ))}
        </Fragment>,
        null
      );
      return;
    }

    setSaving(true);
    showLoader();
    try {
      await axios.put(`/api/paper/${encodeURIComponent(editId)}`, payload);
      router.push(afterEditHref(editId, server, originalDoc));
    } catch (err) {
      console.error(err);
      const res = err.response;
      const reason =
        (res && res.data && res.data.error) ||
        "There was an error saving your changes, please try again.";
      setAlert("Error !", <p>{reason}</p>, null);
    }
    hideLoader();
    setSaving(false);
  };

  return (
    <Box sx={{ display: "flex", gap: 1, mt: 4, mb: 2, alignItems: "center" }}>
      <Typography variant="h6" color="secondary" sx={{ flexGrow: 1 }}>
        Editing published record
      </Typography>
      <RegularStyledButton
        onClick={() => router.push(afterEditHref(editId, server, originalDoc))}
      >
        Cancel
      </RegularStyledButton>
      <RegularStyledButton onClick={save} disabled={saving}>
        Save Changes
      </RegularStyledButton>
    </Box>
  );
};

SaveChangesBar.propTypes = {
  editId: PropTypes.string.isRequired,
  server: PropTypes.string,
  originalDoc: PropTypes.object,
};

const EditModeController = ({ editId, server, children }) => {
  const { setAll, applyLoadedRecord } = useContext(CuratorContext);
  const auth = useContext(AuthContext);
  // applyLoadedRecord fills the form WITHOUT marking it dirty, so the
  // edit-mode unsaved-changes guard only fires on real user edits.
  const loadIntoState = applyLoadedRecord || setAll;
  const [status, setStatus] = useState(editId ? "loading" : "create");
  const [message, setMessage] = useState("");
  const [originalDoc, setOriginalDoc] = useState(null);

  useEffect(() => {
    if (!editId) {
      setStatus("create");
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      setStatus("loading");
      try {
        // Backend decides who may edit; the raw endpoint is gated the same
        // way, so a hand-crafted /curator?edit=... URL gains nothing.
        const permissions = await axios
          .get(`/api/paper/${encodeURIComponent(editId)}/permissions`)
          .then((res) => res.data);
        if (!permissions.can_edit) {
          if (!cancelled) {
            setMessage(
              permissions.authenticated
                ? "Only the record owner, an editor, or an admin can edit this record."
                : "Sign in to edit this record."
            );
            setStatus("unauthorized");
          }
          return;
        }
        const raw = await axios
          .get(`/api/paper/${encodeURIComponent(editId)}/raw`)
          .then((res) => res.data);
        if (cancelled) return;
        setOriginalDoc(raw.paper);
        loadIntoState(convertReqSchematoState(raw.paper));
        setStatus("ready");
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setMessage("The record could not be loaded for editing.");
          setStatus("error");
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  if (status === "create") {
    // Production ownership rule: NEW records need a verified owner, so the
    // backend rejects anonymous publishing (401). Gate the create UI on the
    // same condition — the message replaces the forms/publish controls.
    if (auth && auth.loading) {
      return (
        <Typography variant="h6" color="secondary" sx={{ mt: 4 }}>
          Checking sign-in…
        </Typography>
      );
    }
    if (auth && !auth.authenticated) {
      const features = [
        {
          icon: (
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#800000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          ),
          title: "Curate papers",
          body: "Annotate published papers with structured metadata — link every figure, dataset, and script to the exact files that produced it.",
        },
        {
          icon: (
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#800000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
            </svg>
          ),
          title: "Save drafts",
          body: "Work at your own pace. Drafts are stored to your account so you can pick up where you left off from any device.",
        },
        {
          icon: (
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#800000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
            </svg>
          ),
          title: "Publish and edit",
          body: "Publish records that are permanently attributed to your account. Return at any time to update or correct them.",
        },
        {
          icon: (
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#800000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          ),
          title: "Favorite papers",
          body: "Bookmark papers you find valuable. Your favorites stay synced to your account and are always one click away.",
        },
      ];

      return (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6, mb: 4, px: 2 }}>
          <Box
            sx={{
              width: "100%",
              maxWidth: 680,
              border: "1px solid rgba(128,0,0,0.15)",
              borderRadius: 3,
              overflow: "hidden",
              boxShadow: "0 4px 32px rgba(0,0,0,0.07)",
            }}
          >
            {/* Header */}
            <Box
              sx={{
                backgroundColor: "#800000",
                px: 4,
                py: 3.5,
                textAlign: "center",
              }}
            >
              <Typography variant="h5" sx={{ color: "#fff", fontWeight: 700, letterSpacing: "-0.01em" }}>
                Sign in to start curating
              </Typography>
              <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.75)", mt: 0.75, fontStyle: "italic" }}>
                Your account keeps your work safe and your records attributed.
              </Typography>
            </Box>

            {/* Feature grid */}
            <Box sx={{ px: { xs: 3, sm: 4 }, py: 3.5 }}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: 3,
                  mb: 4,
                }}
              >
                {features.map(({ icon, title, body }) => (
                  <Box key={title} sx={{ display: "flex", gap: 1.75, alignItems: "flex-start" }}>
                    <Box sx={{ flexShrink: 0, mt: 0.25 }}>{icon}</Box>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#800000", mb: 0.25 }}>
                        {title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                        {body}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>

              <Box sx={{ textAlign: "center" }}>
                <RegularStyledButton
                  component="a"
                  href="/login?next=%2Fcurator"
                  sx={{ px: 5, py: 1.2, fontSize: "1rem", letterSpacing: "0.05em" }}
                >
                  Sign in to curate
                </RegularStyledButton>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5, fontStyle: "italic", pl: 3 }}>
                  You will be brought straight back here after signing in.
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      );
    }
    return children(false);
  }

  if (status === "loading") {
    return (
      <Typography variant="h6" color="secondary" sx={{ mt: 4 }}>
        Loading record for editing…
      </Typography>
    );
  }

  if (status !== "ready") {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" color="secondary">
          {message}
        </Typography>
      </Box>
    );
  }

  return (
    <Fragment>
      <SaveChangesBar
        editId={editId}
        server={server}
        originalDoc={originalDoc}
      />
      {children(true)}
    </Fragment>
  );
};

EditModeController.propTypes = {
  editId: PropTypes.string,
  server: PropTypes.string,
  children: PropTypes.func.isRequired,
};

export default EditModeController;
export { SaveChangesBar };
