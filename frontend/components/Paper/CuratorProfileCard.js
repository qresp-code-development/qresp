import PropTypes from "prop-types";
import { Avatar, Box, Paper, Typography } from "@mui/material";

import ProfileLinks, { initialsOf } from "../Profile/ProfileLinks";

const str = (v) => (typeof v === "string" ? v.trim() : "");

// The curator's saved account profile wins: it is kept up to date, while the
// record holds a copy of the name and affiliation from when it was curated.
// With no profile the card is built from the record alone, initials avatar.
const CuratorProfileCard = ({ curator, profile }) => {
  const p = profile && typeof profile === "object" ? profile : {};

  const recordName = [curator.firstName, curator.middleName, curator.lastName]
    .map(str)
    .filter(Boolean)
    .join(" ");
  const email = str(curator.emailId);
  const name = str(p.name) || recordName || email || "Unknown curator";
  const affiliation = str(p.affiliation) || str(curator.affiliation);
  const bio = str(p.bio);
  const avatar = str(p.avatar_b64).startsWith("data:image/") ? str(p.avatar_b64) : undefined;

  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 3, height: "100%" }}
      data-testid="curator-profile-card"
    >
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ letterSpacing: "0.08em", lineHeight: 1 }}
      >
        Curated by
      </Typography>
      <Box sx={{ display: "flex", gap: 2.5, alignItems: "flex-start", mt: 1.5 }}>
        <Avatar
          src={avatar}
          alt={name}
          sx={{
            width: 72,
            height: 72,
            bgcolor: "#800000",
            fontSize: "1.6rem",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initialsOf(name, email)}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h6" component="p" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {name}
          </Typography>
          {affiliation && (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", mt: 0.25 }}>
              {affiliation}
            </Typography>
          )}
          {bio && (
            <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.6, color: "#444" }}>
              {bio}
            </Typography>
          )}
          <ProfileLinks
            email={email}
            orcidId={str(p.orcid_id)}
            websiteUrl={str(p.website_url)}
            scholarUrl={str(p.google_scholar_url)}
            sx={{ mt: 1.25 }}
          />
        </Box>
      </Box>
    </Paper>
  );
};

CuratorProfileCard.propTypes = {
  curator: PropTypes.object.isRequired,
  profile: PropTypes.object,
};

export default CuratorProfileCard;
