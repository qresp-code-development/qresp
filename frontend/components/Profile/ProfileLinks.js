import PropTypes from "prop-types";
import { Box, Tooltip, Typography } from "@mui/material";
import { Language, School } from "@mui/icons-material";

export const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

export const initialsOf = (name, email) =>
  (name || email || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

// Profile data can come from another Qresp server, so only ever link to
// plain http(s) URLs.
const safeHref = (url) =>
  typeof url === "string" && /^https?:\/\/\S+$/i.test(url) ? url : null;

const hostnameOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
};

const linkSx = {
  color: "text.secondary",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 0.5,
  "&:hover": { color: "#800000", textDecoration: "underline" },
};

const OrcidIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#A6CE39" />
    <text
      x="12"
      y="16"
      textAnchor="middle"
      fontSize="10"
      fontWeight="700"
      fill="#fff"
      fontFamily="Arial, sans-serif"
    >
      iD
    </text>
  </svg>
);

const ProfileLinks = ({ email, orcidId, websiteUrl, scholarUrl, sx }) => {
  const website = safeHref(websiteUrl);
  const scholar = safeHref(scholarUrl);
  const orcid = typeof orcidId === "string" && ORCID_RE.test(orcidId) ? orcidId : null;

  if (!email && !orcid && !website && !scholar) return null;

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        columnGap: 2,
        rowGap: 0.75,
        alignItems: "center",
        ...sx,
      }}
    >
      {email && (
        <Typography
          component="a"
          href={`mailto:${email}`}
          variant="body2"
          sx={{
            color: "#800000",
            textDecoration: "none",
            borderBottom: "1px dotted #800000",
            "&:hover": { borderBottomStyle: "solid" },
          }}
        >
          {email}
        </Typography>
      )}
      {orcid && (
        <Tooltip title="ORCID iD" describeChild>
          <Typography
            component="a"
            href={`https://orcid.org/${orcid}`}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={linkSx}
          >
            <OrcidIcon />
            {orcid}
          </Typography>
        </Tooltip>
      )}
      {website && (
        <Tooltip title="Personal website" describeChild>
          <Typography
            component="a"
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={linkSx}
          >
            <Language sx={{ fontSize: 16 }} />
            {hostnameOf(website)}
          </Typography>
        </Tooltip>
      )}
      {scholar && (
        <Tooltip title="Google Scholar" describeChild>
          <Typography
            component="a"
            href={scholar}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={linkSx}
          >
            <School sx={{ fontSize: 16 }} />
            Google Scholar
          </Typography>
        </Tooltip>
      )}
    </Box>
  );
};

ProfileLinks.propTypes = {
  email: PropTypes.string,
  orcidId: PropTypes.string,
  websiteUrl: PropTypes.string,
  scholarUrl: PropTypes.string,
  sx: PropTypes.object,
};

export default ProfileLinks;
