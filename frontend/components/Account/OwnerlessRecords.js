import { Fragment, useEffect, useState } from "react";

import axios from "axios";
import { Box, Button, TextField, Typography } from "@mui/material";
import Link from "next/link";

import { getServer } from "../../Utils/utils";

// Admin-only inventory of legacy records with no verified owner, backed by the
// existing admin APIs (GET /api/admin/ownerless-papers and the admin-gated
// PUT /api/paper/{id}/owner). Rendered on /account only for admins; the
// backend enforces the admin gate regardless, so this is a convenience view.
const OwnerlessRecords = () => {
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");
  // Per-record local state: typed email, in-flight flag, row-level error.
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    let cancelled = false;
    axios
      .get("/api/admin/ownerless-papers")
      .then((res) => {
        if (cancelled) return;
        const items = res.data.papers || [];
        setRecords(items);
        setDrafts(
          items.reduce((acc, item) => {
            acc[item.id] = {
              email: item.suggested_owner_email || "",
              saving: false,
              rowError: "",
            };
            return acc;
          }, {})
        );
      })
      .catch(() => {
        if (!cancelled) {
          setRecords([]);
          setError("Could not load ownerless records.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patchDraft = (id, patch) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const assign = (id) => {
    const draft = drafts[id] || {};
    const email = (draft.email || "").trim();
    if (!email) {
      patchDraft(id, { rowError: "Enter an owner email first." });
      return;
    }
    patchDraft(id, { saving: true, rowError: "" });
    axios
      .put(`/api/paper/${encodeURIComponent(id)}/owner`, { owner_email: email })
      .then(() => {
        setRecords((items) => (items || []).filter((item) => item.id !== id));
      })
      .catch((err) => {
        const res = err.response;
        patchDraft(id, {
          saving: false,
          rowError:
            (res && res.data && res.data.error) ||
            "Assigning the owner failed, please try again.",
        });
      });
  };

  const origin = typeof window === "undefined" ? "" : getServer();

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }
  if (records === null) {
    return <Typography color="secondary">Loading ownerless records...</Typography>;
  }
  if (records.length === 0) {
    return (
      <Typography color="secondary">
        No ownerless records. Every record has a verified owner.
      </Typography>
    );
  }

  return (
    <Fragment>
      <Typography variant="body2" color="secondary" sx={{ mb: 2 }}>
        Legacy records with no verified owner. Assign an owner so they become
        editable. The suggested email is the curator-declared address and is
        unverified &mdash; confirm before assigning.
      </Typography>
      {records.map((record) => {
        const draft = drafts[record.id] || {};
        return (
          <Box
            key={record.id}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
              mb: 2,
              flexWrap: "wrap",
            }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 200 }}>
              <Typography color="secondary">
                {record.title || "Untitled record"}
                {record.year ? ` (${record.year})` : ""}
              </Typography>
              <Typography variant="body2" color="secondary">
                {record.authors}
              </Typography>
              {draft.rowError ? (
                <Typography variant="body2" color="error">
                  {draft.rowError}
                </Typography>
              ) : null}
            </Box>
            <TextField
              size="small"
              label="Owner email"
              value={draft.email || ""}
              onChange={(e) => patchDraft(record.id, { email: e.target.value })}
              sx={{ minWidth: 220 }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={() => assign(record.id)}
              disabled={draft.saving}
            >
              Assign
            </Button>
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
          </Box>
        );
      })}
    </Fragment>
  );
};

export default OwnerlessRecords;
