import { useContext, useState, Fragment } from "react";
import axios from "axios";
import Router from "next/router";
import { Box, Button, Paper, Typography } from "@mui/material";
import { Save, Visibility } from "@mui/icons-material";

import Ajv from "ajv";

import { RegularStyledButton } from "../button";
import { convertStatetoReqSchema } from "../../Utils/model";
import { getServer } from "../../Utils/utils";
import { deleteServerDraft } from "../../Utils/serverDrafts";

import Schema from "../../public/schema_v1.2.json";
import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import ServerContext from "../../Context/Servers/serverContext";
import AlertContext from "../../Context/Alert/alertContext";
import LoadingContext from "../../Context/Loading/loadingContext";
import { saveThenPreview } from "./TopActions";

// `$id`/`id` anchors removed; property schemas NAMED "id" are kept (their
// value is an object, an anchor's is a string).
export const stripSchemaIds = (node) => {
  if (Array.isArray(node)) return node.map(stripSchemaIds);
  if (!node || typeof node !== "object") return node;
  const out = {};
  Object.entries(node).forEach(([key, value]) => {
    if ((key === "$id" || key === "id") && typeof value === "string") return;
    out[key] = stripSchemaIds(value);
  });
  return out;
};

let compiledSchema;
export const publishSchemaValidator = () => {
  if (compiledSchema === undefined) {
    try {
      compiledSchema = new Ajv({ strict: false, allErrors: true }).compile(
        stripSchemaIds(Schema)
      );
    } catch (e) {
      // Leave it to the server; never block or crash the curator over this.
      compiledSchema = null;
    }
  }
  return compiledSchema;
};

const validate = (editing, metadata) => {
  /*
  Validate before sending a publish request.

  Nothing a curator types is required to publish, for any work type: a
  record can go out with every field blank, so data is shared first and
  described later. Sections still open are not a blocker either -- the
  caller publishes what is typed in them (collectDraftState). What remains
  is the same STRUCTURE/format check the server makes (schema.json).
  */
  // The same schema the server checks. Its draft-04-era `$id` anchors are
  // duplicated (e.g. "#/properties/collections/items" twice), which Ajv 8
  // refuses to compile -- so they are stripped from a copy first. If it
  // still cannot compile, the server re-validates every publish anyway.
  const check = publishSchemaValidator();
  if (check) {
    if (!check(metadata)) {
      return {
        valid: false,
        errors: [
          <Fragment key="schema">
            <strong>The record does not match the publishing format:</strong>
            <ul>
              {(check.errors || []).slice(0, 8).map((error, i) => (
                <li key={i}>
                  {`${error.instancePath || "record"} ${error.message}`}
                </li>
              ))}
            </ul>
          </Fragment>,
        ],
      };
    }
  }

  return { valid: true, errors: [] };
};

// Reused by the edit flow (EditMode.js) so create and edit validate alike.
export { validate };

const getPublishErrorMessage = (err) => {
  const data = err && err.response && err.response.data;
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    if (data.msg) return data.msg;
    if (data.error) return data.error;
    if (data.message) return data.message;
    return JSON.stringify(data);
  }
  if (err && err.message) return err.message;
  return "Please try again.";
};

export { getPublishErrorMessage };

const makePublishRequest = (
  paper,
  setAlert,
  showLoader,
  hideLoader,
  draft = {}
) => {
  const { activeDraftId, clearActiveDraft } = draft;
  showLoader();
  axios
    .post(getServer() + "/api/publish", paper)
    .then((res) => {
      // The record is live as soon as this returns, so the account draft it
      // came from can be deleted right away -- still only on request.
      const id = res.data && res.data.id;
      const removeDraft = () => {
        deleteServerDraft(activeDraftId)
          .then(() => {
            if (clearActiveDraft) clearActiveDraft();
            setAlert(
              "Draft removed",
              "The saved draft you published from was deleted from your account.",
              null
            );
          })
          .catch(() => {
            setAlert(
              "Error",
              "The draft could not be deleted. You can remove it from Account > My drafts.",
              null
            );
          });
      };
      const draftButton = activeDraftId ? (
        <RegularStyledButton onClick={removeDraft}>
          Delete the saved draft
        </RegularStyledButton>
      ) : null;
      const viewButton = id ? (
        <RegularStyledButton
          component="a"
          href={`/paperdetails/${encodeURIComponent(id)}?server=${getServer()}`}
        >
          View the record
        </RegularStyledButton>
      ) : null;
      setAlert(
        "Success",
        <p style={{ textAlign: "justify" }}>
          Your record is published and can now be found in the Explorer.
          {activeDraftId ? (
            <Fragment>
              <br />
              <br />
              You can now delete the saved draft you published from.
            </Fragment>
          ) : null}
        </p>,
        viewButton || draftButton ? (
          <Fragment>
            {viewButton}
            {draftButton}
          </Fragment>
        ) : null
      );
    })
    .catch((err) => {
      console.error(err);
      const message = getPublishErrorMessage(err);
      setAlert(
        "Error !",
        <p>
          We're very sorry but there was an error publishing the paper!, Please
          try again
          <br />
          {message && `Error Message: ${message}`}
        </p>,
        null
      );
    })
    .finally(() => hideLoader());
};

const Publish = () => {
  const {
    metadata,
    activeDraftId,
    clearActiveDraft,
    collectDraftState,
    saveDraftToServer,
    getDraftTitle,
  } = useContext(CuratorContext);

  const { editing } = useContext(CuratorHelperContext);
  const { selectedHttp } = useContext(ServerContext);
  const { setAlert } = useContext(AlertContext);
  const { showLoader, hideLoader } = useContext(LoadingContext);
  const [draftSaving, setDraftSaving] = useState(false);

  const onPreview = () =>
    saveThenPreview({
      metadata,
      collectDraftState,
      saveDraftToServer,
      getDraftTitle,
      setAlert,
      router: { push: (...args) => Router.push(...args) },
    });

  const onSaveDraft = () => {
    if (!saveDraftToServer) return;
    const title =
      (getDraftTitle && getDraftTitle()) ||
      (metadata.referenceInfo && metadata.referenceInfo.title) ||
      "Untitled draft";
    setDraftSaving(true);
    saveDraftToServer(title)
      .then(() =>
        setAlert(
          "Draft saved",
          "Your draft was saved to your account. Resume it any time from Account > My drafts.",
          null
        )
      )
      .catch(() =>
        setAlert(
          "Error",
          "Your draft could not be saved. Please check that you are still signed in and try again.",
          null
        )
      )
      .finally(() => setDraftSaving(false));
  };

  const onClick = () => {
    // Everything on the page, including sections still open for editing.
    const current = collectDraftState ? collectDraftState() : metadata;
    const paper = convertStatetoReqSchema(current, selectedHttp);
    const isValid = validate(editing, paper);
    if (!isValid.valid) {
      setAlert(
        "Something's missing",
        <Fragment>
          {isValid.errors.map((el, i) => (
            <div key={i}>{el}</div>
          ))}
        </Fragment>,
        null
      );
      return;
    }

    makePublishRequest(paper, setAlert, showLoader, hideLoader, {
      activeDraftId,
      clearActiveDraft,
    });
  };

  return (
    <Box sx={{ mt: 5, mb: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
        <Typography
          variant="overline"
          sx={{ color: "text.secondary", letterSpacing: "0.12em", whiteSpace: "nowrap" }}
        >
          Ready to publish?
        </Typography>
        <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
      </Box>

      <Paper
        variant="outlined"
        sx={{
          p: 3,
          borderRadius: 2,
          borderColor: "rgba(128,0,0,0.25)",
          bgcolor: "rgba(128,0,0,0.02)",
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Nothing is required: publish what you have now, even if it is just
          the data, and fill in the details later by editing the record.
          Anything typed in a section you have not saved is included. After
          submitting, you&rsquo;ll receive an email with a verification link.
        </Typography>
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={onClick}
          sx={{
            bgcolor: "#800000",
            "&:hover": { bgcolor: "#9a0000" },
            py: 1.5,
            fontSize: "1rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            borderRadius: 2,
          }}
        >
          Publish
        </Button>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 1.5,
            mt: 1.5,
          }}
        >
          <Button
            variant="outlined"
            startIcon={<Visibility />}
            onClick={onPreview}
            sx={{ color: "#800000", borderColor: "rgba(128,0,0,0.5)", borderRadius: 2 }}
          >
            Save &amp; preview record
          </Button>
          <Button
            variant="outlined"
            startIcon={<Save />}
            onClick={onSaveDraft}
            disabled={draftSaving || !saveDraftToServer}
            sx={{ color: "#800000", borderColor: "rgba(128,0,0,0.5)", borderRadius: 2 }}
          >
            {draftSaving ? "Saving…" : "Save draft"}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default Publish;
