import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import axios from "axios";
import { Box, Grid, Link as MuiLink, Paper, Typography } from "@mui/material";
import { FolderOpen, Gavel } from "@mui/icons-material";

import CuratorProfileCard from "./CuratorProfileCard";
import licenses from "../../data/licenses";

const InfoCard = ({ icon, title, children }) => (
  <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
      <Box sx={{ color: "#800000", display: "flex" }}>{icon}</Box>
      <Typography variant="subtitle2" fontWeight={700}>
        {title}
      </Typography>
    </Box>
    {children}
  </Paper>
);

const AboutRecord = ({ paperId, preview, curator, fileServerPath, license }) => {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    // Previews resolve through the same endpoint, by the curator's email.
    if (!paperId) return undefined;
    let cancelled = false;
    axios
      .get(`/api/paper/${encodeURIComponent(paperId)}/curator`)
      .then((res) => {
        if (!cancelled) setProfile((res && res.data && res.data.profile) || null);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [paperId, preview]);

  const licenseInfo = license ? licenses[license] : null;

  return (
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, md: 7 }}>
        <CuratorProfileCard curator={curator} profile={profile} />
      </Grid>
      <Grid size={{ xs: 12, md: 5 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          {fileServerPath && (
            <InfoCard icon={<FolderOpen fontSize="small" />} title="Data location">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Files for this record are hosted on the research computing server:
              </Typography>
              <MuiLink
                href={fileServerPath}
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                sx={{ wordBreak: "break-all", color: "#800000" }}
              >
                {fileServerPath}
              </MuiLink>
            </InfoCard>
          )}
          {license && (
            <InfoCard icon={<Gavel fontSize="small" />} title="License">
              <Typography variant="body2" color="text.secondary">
                {licenseInfo ? (
                  <MuiLink
                    href={licenseInfo.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: "#800000" }}
                  >
                    {licenseInfo.title}
                  </MuiLink>
                ) : (
                  license
                )}
              </Typography>
              {licenseInfo && licenseInfo.infographics.length > 0 && (
                <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                  {licenseInfo.infographics.map((image) => (
                    <img key={image} src={"/images/" + image} alt="" height={28} />
                  ))}
                </Box>
              )}
            </InfoCard>
          )}
        </Box>
      </Grid>
    </Grid>
  );
};

AboutRecord.propTypes = {
  paperId: PropTypes.string,
  preview: PropTypes.bool,
  curator: PropTypes.object.isRequired,
  fileServerPath: PropTypes.string,
  license: PropTypes.string,
};

export default AboutRecord;
