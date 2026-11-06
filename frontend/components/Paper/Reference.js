import PropTypes from "prop-types";

import { Box, Button, Chip, Divider, Grid, Paper, Typography } from "@mui/material";
import { CloudDownload, Link as LinkIcon, MenuBook, OpenInNew } from "@mui/icons-material";

import Tag from "../tag";
import SocialShare from "../social";
import { WORK_TYPE_ICONS } from "../CuratorElements/WorkTypeChooser";
import { workTypeInfo, workTypeOf } from "../../Utils/workTypes";

// The link button a non-paper work gets for its reference URL.
const URL_ACTION = {
  report: "Read the report",
  software: "View repository",
  dataset: "View data page",
  other: "Open link",
};

const toList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
};

const DetailRow = ({ label, children }) => (
  <Box sx={{ mb: 1.75 }}>
    <Typography
      variant="caption"
      component="div"
      sx={{
        color: "text.secondary",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        fontWeight: 600,
        mb: 0.25,
      }}
    >
      {label}
    </Typography>
    <Typography variant="body2" component="div" sx={{ color: "#333", lineHeight: 1.55 }}>
      {children}
    </Typography>
  </Box>
);

const actionSx = {
  textTransform: "none",
  borderColor: "rgba(128,0,0,0.4)",
  color: "#800000",
  "&:hover": { borderColor: "#800000", bgcolor: "rgba(128,0,0,0.04)" },
};

const ReferenceInfo = ({ referenceData, actions }) => {
  const {
    title,
    authors,
    tags,
    collections,
    PIs,
    publication,
    year,
    doi,
    cite,
    downloadPath,
    notebookFile,
    abstract,
    fileServerPath,
    institution,
    workType,
    url,
  } = referenceData;
  // Legacy records (no work type) are published papers and render as before.
  const type = workTypeOf(workType);
  const typeInfo = workTypeInfo(type);
  const isPaper = Boolean(typeInfo.paperFields);
  const TypeIcon = WORK_TYPE_ICONS[type];
  const venue = !isPaper && typeInfo.venueLabel ? publication : "";
  const urlAction = !isPaper && url ? URL_ACTION[type] : null;

  const notebook =
    notebookFile && fileServerPath
      ? "https://nbviewer.jupyter.org/url/" +
        fileServerPath.replace(/(^\w+:|^)\/\//, "") +
        "/" +
        notebookFile
      : null;
  const doiUrl = doi ? "https://doi.org/" + doi : null;
  const publishedIn = isPaper
    ? [publication, year ? `(${year})` : ""].filter(Boolean).join(" ")
    : "";
  const collectionList = toList(collections);
  const piList = toList(PIs);
  const citeText = Array.isArray(cite) ? cite.join(", ") : cite;
  const hasDetails =
    collectionList.length || piList.length || publishedIn || venue || doi || citeText;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 4 }}>
      <Box sx={{ height: 4, bgcolor: "#800000" }} />
      <Box sx={{ p: { xs: 2.5, md: 4 } }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {publishedIn && (
              <Typography
                variant="overline"
                component="div"
                sx={{ color: "#800000", letterSpacing: "0.08em", lineHeight: 1.6 }}
              >
                {publishedIn}
              </Typography>
            )}
            {!isPaper && (
              <Typography
                variant="overline"
                component="div"
                data-testid="record-work-type"
                sx={{
                  color: "#800000",
                  letterSpacing: "0.08em",
                  lineHeight: 1.6,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                }}
              >
                <TypeIcon sx={{ fontSize: 16 }} aria-hidden="true" />
                {[typeInfo.label, year ? String(year) : ""].filter(Boolean).join(" · ")}
              </Typography>
            )}
            <Typography
              variant="h4"
              component="h1"
              sx={{ fontWeight: 700, color: "#222", lineHeight: 1.25, fontSize: { xs: "1.6rem", md: "2.1rem" } }}
            >
              {title || "Untitled record"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {actions}
            <SocialShare />
          </Box>
        </Box>

        {/* The byline. Institution rides in the SAME row, right after the
            author text -- a compact fact about the record, not a new line
            of its own. */}
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 1,
            rowGap: 0.5,
            mt: 1.5,
          }}
        >
          <Typography variant="subtitle1" component="span" sx={{ color: "#555" }}>
            by {authors}
          </Typography>
          {institution ? (
            <Chip
              size="small"
              variant="outlined"
              label={`Institution: ${institution}`}
              data-testid="record-institution"
            />
          ) : null}
        </Box>

        {tags && tags.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            {tags.map((tag) => (
              <Tag label={tag} key={tag} size="small" />
            ))}
          </Box>
        )}

        {(doiUrl || urlAction || downloadPath || notebook) && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2.5 }}>
            {urlAction && (
              <Button
                variant="outlined"
                size="small"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<LinkIcon fontSize="small" />}
                sx={actionSx}
                data-testid="record-url-action"
              >
                {urlAction}
              </Button>
            )}
            {doiUrl && (
              <Button
                variant="outlined"
                size="small"
                href={doiUrl}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<OpenInNew fontSize="small" />}
                sx={actionSx}
              >
                {isPaper ? "View publication" : "View DOI record"}
              </Button>
            )}
            {downloadPath && (
              <Button
                variant="outlined"
                size="small"
                href={downloadPath}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<CloudDownload fontSize="small" />}
                sx={actionSx}
              >
                Download data (Globus)
              </Button>
            )}
            {notebook && (
              <Button
                variant="outlined"
                size="small"
                href={notebook}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<MenuBook fontSize="small" />}
                sx={actionSx}
              >
                Jupyter notebook
              </Button>
            )}
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        <Grid container spacing={4}>
          <Grid size={{ xs: 12, md: hasDetails ? 8 : 12 }}>
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1, color: "#222" }}>
              {typeInfo.abstractLabel}
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: "#444", lineHeight: 1.75, textAlign: "justify", whiteSpace: "pre-line" }}
            >
              {abstract || `No ${typeInfo.abstractLabel.toLowerCase()} provided.`}
            </Typography>
          </Grid>
          {hasDetails ? (
            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  bgcolor: "#faf7f7",
                  border: "1px solid rgba(128,0,0,0.12)",
                  borderRadius: 2,
                  p: 2.5,
                  pb: 0.75,
                }}
              >
                {publishedIn && <DetailRow label="Published in">{publishedIn}</DetailRow>}
                {venue && <DetailRow label={typeInfo.venueLabel}>{venue}</DetailRow>}
                {doi && (
                  <DetailRow label="DOI">
                    <Box
                      component="a"
                      href={doiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ color: "#800000", wordBreak: "break-all" }}
                    >
                      {doi}
                    </Box>
                  </DetailRow>
                )}
                {piList.length > 0 && (
                  <DetailRow label="Principal investigators">{piList.join(", ")}</DetailRow>
                )}
                {collectionList.length > 0 && (
                  <DetailRow label="Collections">
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.25 }}>
                      {collectionList.map((c) => (
                        <Chip key={c} label={c} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </DetailRow>
                )}
                {citeText && <DetailRow label="Cite">{citeText}</DetailRow>}
              </Box>
            </Grid>
          ) : null}
        </Grid>
      </Box>
    </Paper>
  );
};

ReferenceInfo.propTypes = {
  referenceData: PropTypes.object.isRequired,
  actions: PropTypes.node,
};

export default ReferenceInfo;
