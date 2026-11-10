// The guided setup's AI pieces that more than one step uses: the "what does
// this button do" popover, the consent dialog for AI buttons outside the AI
// assistant step, and the review list for AI-proposed items, links and edits.
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Popover,
  Typography,
} from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";

import { labelFor } from "../../Utils/artifactFields";

export const AI_SENDS =
  "The paper's title, abstract and figure captions, the list of files in the project folder, its READMEs and the start of each script are sent to Google Gemini. Nothing is stored.";

// What each AI button does, in one place, so the popover and the
// documentation cannot drift apart.
export const AI_HELP = {
  find: {
    title: "Find with AI",
    what: "A backup for when the folder scan finds nothing, or misses something. The AI reads the folder's file list, its READMEs and the start of each script, and proposes the figures, datasets and scripts that are not in the record yet.",
    uses: "The folder's file list, README files, script excerpts, and the paper's title, abstract and captions.",
    result: "A list of proposed items with the reason for each. Every path is checked against the real folder, and nothing is added until you tick it and choose Add selected.",
  },
  match: {
    title: "Match with AI",
    what: "For figures whose file names in the LaTeX source differ from the image names in the project folder (fig3.pdf vs. band_structure.png). The AI decides which LaTeX figure each image is, from names, numbers, labels and the caption's content.",
    uses: "The LaTeX figures' numbers, labels, \\includegraphics names and captions, and the names of the record's figure images.",
    result: "Proposed matches with a reason and a confidence. The caption applied is always the paper's own text from the source; the AI only picks which one.",
  },
  keywords: {
    title: "Suggest keywords",
    what: "Suggests 2–4 keywords for each figure from its caption, and keywords for the whole paper when it has none.",
    uses: "The paper's title, abstract and existing keywords, and each figure's caption.",
    result: "Keywords per figure. Keywords you wrote yourself are only replaced if you tick them.",
  },
  descriptions: {
    title: "Suggest descriptions",
    what: "Writes a one- or two-sentence description for each dataset and script: what it contains or does, and which figure it is for. Figures whose caption could not be found get a short drafted description too, marked as AI-written so it is never mistaken for the paper's caption.",
    uses: "Each dataset's file names and the first lines of small text files, the start of each script, the figure image names and captions, the paper's abstract and the links between them.",
    result: "A description per item, with a confidence. Descriptions you already wrote are only replaced if you tick them.",
  },
  links: {
    title: "Suggest missing links",
    what: "Proposes which scripts produced which figures, and which datasets fed them, where Qresp's own matching found no link.",
    uses: "The figure captions, the start of each script, and the datasets' file names.",
    result: "Links with a one-sentence reason and a confidence. Low-confidence links start unticked.",
  },
  curate: {
    title: "Curate the whole folder with AI",
    what: "Looks over the whole project folder and everything already in the record. Proposes figures, datasets, scripts and tools that are missing, links between them, and improvements to what is there: missing figure numbers, keywords, better descriptions, plus notes on anything that looks incomplete.",
    uses: "The folder's file list, README files, script excerpts, the paper's details, and the record's current figures, datasets, scripts and tools.",
    result: "One review list: new items, links, and suggested edits showing the current value. Edits that would replace something you wrote start unticked. Captions are never rewritten.",
  },
};

export const AiInfoButton = ({ help }) => {
  const [anchor, setAnchor] = useState(null);
  if (!help) return null;
  return (
    <>
      <IconButton
        size="small"
        aria-label={`About ${help.title}`}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ color: "text.secondary", "&:hover": { color: "#800000" } }}
      >
        <InfoOutlined fontSize="small" />
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { maxWidth: 380, p: 2, borderRadius: 2 } } }}
      >
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          {help.title}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>{help.what}</Typography>
        <Typography variant="caption" fontWeight={700} color="text.secondary" component="div">
          What is sent
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{help.uses}</Typography>
        <Typography variant="caption" fontWeight={700} color="text.secondary" component="div">
          What you get
        </Typography>
        <Typography variant="body2" color="text.secondary">{help.result}</Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          Sent to Google Gemini; nothing is stored. Uses one of your daily AI requests.
        </Typography>
      </Popover>
    </>
  );
};

export const AiConsentDialog = ({ open, onCancel, onConfirm }) => (
  <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
    <DialogTitle sx={{ fontWeight: 700 }}>Use the AI assistant?</DialogTitle>
    <DialogContent>
      <Typography variant="body2" color="text.secondary">{AI_SENDS}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Suggestions are only applied when you choose them.
      </Typography>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel} sx={{ textTransform: "none" }}>Cancel</Button>
      <Button variant="contained" disableElevation onClick={onConfirm} sx={{ textTransform: "none" }}>
        Send and continue
      </Button>
    </DialogActions>
  </Dialog>
);

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export const CURATE_GROUPS = [
  { key: "charts", list: "charts", type: "chart", title: "Figures" },
  { key: "datasets", list: "datasets", type: "dataset", title: "Datasets" },
  { key: "scripts", list: "scripts", type: "script", title: "Scripts" },
  { key: "tools", list: "tools", type: "tool", title: "Tools" },
];

const TYPE_OF = { c: "chart", d: "dataset", s: "script", t: "tool" };

export const curateItemsOf = (result) =>
  result
    ? CURATE_GROUPS.flatMap(({ key, list, type }) =>
        ((result.proposal || {})[key] || []).map((item) => ({ ...item, list, type })))
    : [];

export const curateLabel = (item) =>
  item.type === "chart"
    ? `${String(item.imageFile).split("/").pop()}${item.number ? ` (${/^Table/.test(item.number) ? item.number : `Figure ${item.number}`})` : ""}`
    : item.type === "tool"
    ? `${item.packageName} ${item.version}`
    : (item.files || []).join(", ");

export const editKey = (edit) => `edit:${edit.id}:${edit.field}`;

const shown = (value) => (Array.isArray(value) ? value.join(", ") : String(value || ""));

const GroupTitle = ({ children }) => (
  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
    {children}
  </Typography>
);

const Row = ({ checked, onToggle, label, children }) => (
  <Box sx={{ display: "flex", gap: 0.5, alignItems: "flex-start" }}>
    <Checkbox
      size="small"
      checked={checked}
      onChange={(e) => onToggle(e.target.checked)}
      slotProps={{ input: { "aria-label": label } }}
    />
    <Box sx={{ minWidth: 0 }}>{children}</Box>
  </Box>
);

// New items, links between them, and (from a review) edits to existing
// items and notes. `skip` holds every unticked key.
export const ProposalReview = ({ result, skip, setSkip, recordLabel, intro, emptyText }) => {
  const items = curateItemsOf(result);
  const links = result.links || [];
  const edits = result.edits || [];
  const notes = result.notes || [];
  const labels = Object.fromEntries(items.map((item) => [item.key, curateLabel(item)]));
  const endLabel = (id) => labels[id] || recordLabel(id);
  const toggle = (key) => (checked) => setSkip((x) => ({ ...x, [key]: !checked }));

  if (!items.length && !links.length && !edits.length && !notes.length) {
    return (
      <Typography variant="body2" color="text.secondary">{emptyText}</Typography>
    );
  }
  return (
    <Box>
      {intro && <Typography variant="body2" sx={{ mb: 1 }}>{intro}</Typography>}
      {notes.length > 0 && (
        <Alert severity="info" sx={{ mb: 1 }}>
          <Typography variant="body2" fontWeight={600}>Notes on the record</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {notes.map((note) => <li key={note}><Typography variant="body2">{note}</Typography></li>)}
          </Box>
        </Alert>
      )}
      {(items.length > 0 || links.length > 0 || edits.length > 0) && (
        <Box sx={{ maxHeight: 420, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1 }}>
          {CURATE_GROUPS.map(({ key, type, title }) => {
            const group = items.filter((item) => item.type === type);
            if (!group.length) return null;
            return (
              <Box key={key} sx={{ mb: 1 }}>
                <GroupTitle>{title}</GroupTitle>
                {group.map((item) => (
                  <Row key={item.key} checked={!skip[item.key]} onToggle={toggle(item.key)} label={curateLabel(item)}>
                    <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
                      {curateLabel(item)}
                    </Typography>
                    {item.description && (
                      <Typography variant="caption" component="div">{item.description}</Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" component="div">{item.reason}</Typography>
                  </Row>
                ))}
              </Box>
            );
          })}
          {links.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <GroupTitle>Links</GroupTitle>
              {links.map((link) => {
                const id = `${link.from}>${link.to}`;
                return (
                  <Row key={id} checked={!skip[id]} onToggle={toggle(id)} label={`${endLabel(link.from)} to ${endLabel(link.to)}`}>
                    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                      {`${endLabel(link.from)} → ${endLabel(link.to)}`}
                      <Chip size="small" label={link.confidence} variant="outlined" sx={{ ml: 1, height: 18 }} />
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{link.reason}</Typography>
                  </Row>
                );
              })}
            </Box>
          )}
          {edits.length > 0 && (
            <Box>
              <GroupTitle>Improvements to what is already there</GroupTitle>
              {edits.map((edit) => {
                const key = editKey(edit);
                const field = labelFor(TYPE_OF[edit.id[0]], edit.field);
                return (
                  <Row key={key} checked={!skip[key]} onToggle={toggle(key)} label={`${field} for ${recordLabel(edit.id)}`}>
                    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                      <strong>{recordLabel(edit.id)}</strong>
                      {` · ${field}: ${shown(edit.value)}`}
                    </Typography>
                    {shown(edit.current) && (
                      <Typography variant="caption" color="warning.main" component="div">
                        {`Replaces: ${shown(edit.current)}`}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" component="div">{edit.reason}</Typography>
                  </Row>
                );
              })}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

// Untick by default: low-confidence links, and edits that would replace a
// value the curator already has.
export const defaultProposalSkip = (result) => {
  const skip = {};
  ((result && result.links) || []).forEach((link) => {
    if (link.confidence === "low") skip[`${link.from}>${link.to}`] = true;
  });
  ((result && result.edits) || []).forEach((edit) => {
    if (shown(edit.current).trim()) skip[editKey(edit)] = true;
  });
  return skip;
};

export const proposalCount = (result) =>
  curateItemsOf(result).length + ((result && result.links) || []).length +
  ((result && result.edits) || []).length;

export { plural };
