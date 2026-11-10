import PropTypes from "prop-types";
import { Grid, Typography } from "@mui/material";

import Drawer from "../drawer";

import licenses from "../../data/licenses";

const LicenseInfo = ({ type, editor, defaultOpen }) => {
  const license = licenses[type];

  return (
    type && (
      <Drawer heading="License" editor={editor} defaultOpen={defaultOpen}>
        <Grid container direction="row" sx={{ alignItems: "center" }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Typography color="secondary">
              The work presented here is licensed under a{" "}
              {license ? (
                <a
                  href={license.link}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {license.title}
                </a>
              ) : (
                type
              )}
            </Typography>
          </Grid>
          {license && (
            <Grid size={{ xs: 12, md: 5 }}>
              <Grid
                container
                direction="row"
                spacing={2}
                sx={{ alignItems: "center", justifyContent: "center" }}
              >
                {license.infographics.map((image) => {
                  return (
                    <Grid key={image}>
                      <img src={"/images/" + image} />
                    </Grid>
                  );
                })}
              </Grid>
            </Grid>
          )}
        </Grid>
      </Drawer>
    )
  );
};

LicenseInfo.propTypes = {
  type: PropTypes.string.isRequired,
  defaultOpen: PropTypes.bool,
  editor: PropTypes.func,
};

export default LicenseInfo;
