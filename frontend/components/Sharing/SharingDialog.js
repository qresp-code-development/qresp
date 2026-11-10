import { useEffect, useState } from "react";
import PropTypes from "prop-types";

import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Close,
  GroupAddOutlined,
  LockOutlined,
  PersonOutlined,
  PublicOutlined,
} from "@mui/icons-material";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const splitEmails = (text) =>
  (text || "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

// One selectable visibility card (Public / Private).
const VisibilityOption = ({ selected, icon, title, description, onClick, testId }) => (
  <ButtonBase
    role="radio"
    aria-checked={selected}
    data-testid={testId}
    onClick={onClick}
    sx={{
      flex: 1,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      gap: 1.5,
      p: 1.5,
      textAlign: "left",
      borderRadius: 2,
      border: "1px solid",
      borderColor: selected ? "primary.main" : "divider",
      bgcolor: selected ? "action.selected" : "transparent",
      transition: "border-color 120ms, background-color 120ms",
      "&:hover": { borderColor: selected ? "primary.main" : "text.secondary" },
    }}
  >
    <Box sx={{ color: selected ? "primary.main" : "text.secondary", mt: 0.25 }}>
      {icon}
    </Box>
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {description}
      </Typography>
    </Box>
  </ButtonBase>
);

VisibilityOption.propTypes = {
  selected: PropTypes.bool,
  icon: PropTypes.node,
  title: PropTypes.string,
  description: PropTypes.string,
  onClick: PropTypes.func,
  testId: PropTypes.string,
};

const ROLES = {
  viewer: { label: "Viewer", hint: "Can view" },
  editor: { label: "Editor", hint: "Can view and edit" },
};

const RoleSelect = ({ value, onChange, ariaLabel, disabled, testId }) => (
  <Select
    size="small"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    inputProps={{ "aria-label": ariaLabel }}
    data-testid={testId}
    sx={{ minWidth: 112, height: 40, flexShrink: 0 }}
  >
    {Object.entries(ROLES).map(([key, { label }]) => (
      <MenuItem key={key} value={key}>
        {label}
      </MenuItem>
    ))}
  </Select>
);

RoleSelect.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  ariaLabel: PropTypes.string,
  disabled: PropTypes.bool,
  testId: PropTypes.string,
};

// Visibility + everyone the record is shared with, each as a Viewer or an
// Editor. Shared by My Records and the record page; the caller performs the
// save (one PUT /visibility carrying both lists) and may throw an Error whose
// message is shown inline.
const SharingDialog = ({
  open,
  onClose,
  recordTitle,
  initialPrivate,
  initialViewers,
  initialEditors,
  onSave,
}) => {
  const [isPrivate, setIsPrivate] = useState(false);
  const [people, setPeople] = useState([]);
  const [draft, setDraft] = useState("");
  const [draftRole, setDraftRole] = useState("viewer");
  const [draftError, setDraftError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsPrivate(Boolean(initialPrivate));
    const editors = initialEditors || [];
    setPeople([
      ...editors.map((email) => ({ email, role: "editor" })),
      ...(initialViewers || [])
        .filter((email) => !editors.includes(email))
        .map((email) => ({ email, role: "viewer" })),
    ]);
    setDraft("");
    setDraftRole("viewer");
    setDraftError("");
    setError("");
    setSaving(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Adds every valid address in the draft; returns the new list, or null
  // when something in the draft is not an email.
  const commitDraft = () => {
    const emails = splitEmails(draft);
    const invalid = emails.filter((e) => !EMAIL.test(e));
    if (invalid.length) {
      setDraftError(`Not a valid email: ${invalid.join(", ")}`);
      return null;
    }
    // Re-adding someone already listed just changes their role.
    const next = people.map((p) =>
      emails.includes(p.email) ? { ...p, role: draftRole } : p
    );
    emails.forEach((email) => {
      if (!next.some((p) => p.email === email)) next.push({ email, role: draftRole });
    });
    setPeople(next);
    setDraft("");
    setDraftError("");
    return next;
  };

  const save = async () => {
    // An address typed but not yet added is almost always meant to be saved.
    const list = draft.trim() ? commitDraft() : people;
    if (list === null) return;
    setSaving(true);
    setError("");
    try {
      await onSave({
        isPrivate,
        viewers: list.filter((p) => p.role === "viewer").map((p) => p.email),
        editors: list.filter((p) => p.role === "editor").map((p) => p.email),
      });
    } catch (err) {
      setError(err?.message || "Updating sharing failed, please try again.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 0.5 }}>
        <GroupAddOutlined color="primary" />
        Visibility &amp; sharing
      </DialogTitle>
      <DialogContent>
        {recordTitle ? (
          <Typography variant="body2" color="text.secondary" noWrap sx={{ mb: 2 }}>
            {recordTitle}
          </Typography>
        ) : null}

        <Typography variant="overline" color="text.secondary">
          Visibility
        </Typography>
        <Box role="radiogroup" sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2.5 }}>
          <VisibilityOption
            selected={!isPrivate}
            icon={<PublicOutlined />}
            title="Public"
            description="Anyone can find it in search and the explorer."
            onClick={() => setIsPrivate(false)}
            testId="sharing-visibility-public"
          />
          <VisibilityOption
            selected={isPrivate}
            icon={<LockOutlined />}
            title="Private"
            description="Only you, admins and the people below can open it."
            onClick={() => setIsPrivate(true)}
            testId="sharing-visibility-private"
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        <Typography variant="overline" color="text.secondary">
          People with access
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Add people by email"
            value={draft}
            error={Boolean(draftError)}
            helperText={draftError || " "}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              }
            }}
            slotProps={{ htmlInput: { "data-testid": "sharing-add-input" } }}
          />
          <RoleSelect
            value={draftRole}
            onChange={setDraftRole}
            ariaLabel="Role for new people"
            testId="sharing-add-role"
          />
          <Button
            variant="outlined"
            onClick={commitDraft}
            disabled={!draft.trim()}
            data-testid="sharing-add"
            sx={{ height: 40, flexShrink: 0 }}
          >
            Add
          </Button>
        </Box>

        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
          }}
        >
          {people.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
              Only you have access.
            </Typography>
          ) : (
            people.map(({ email, role }, index) => (
              <Box
                key={email}
                data-testid="sharing-collaborator"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 1,
                  borderTop: index ? "1px solid" : "none",
                  borderColor: "divider",
                }}
              >
                <Avatar sx={{ width: 32, height: 32, bgcolor: "action.selected", color: "text.secondary" }}>
                  <PersonOutlined fontSize="small" />
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {email}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {role === "viewer" && !isPrivate
                      ? "Can view (the record is public)"
                      : ROLES[role].hint}
                  </Typography>
                </Box>
                <RoleSelect
                  value={role}
                  onChange={(next) =>
                    setPeople((list) =>
                      list.map((p) => (p.email === email ? { ...p, role: next } : p))
                    )
                  }
                  ariaLabel={`Role for ${email}`}
                />
                <Tooltip title="Remove">
                  <span>
                    <IconButton
                      size="small"
                      aria-label={`Remove ${email}`}
                      onClick={() => setPeople((list) => list.filter((p) => p.email !== email))}
                    >
                      <Close fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            ))
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          People sign in with this email. Viewers can open a private record;
          editors can also change it. Neither can change sharing or delete
          the record.
        </Typography>

        {error ? (
          <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
            {error}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disableElevation
          onClick={save}
          disabled={saving}
          data-testid="sharing-save"
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

SharingDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  recordTitle: PropTypes.string,
  initialPrivate: PropTypes.bool,
  initialViewers: PropTypes.arrayOf(PropTypes.string),
  initialEditors: PropTypes.arrayOf(PropTypes.string),
  onSave: PropTypes.func,
};

export default SharingDialog;
