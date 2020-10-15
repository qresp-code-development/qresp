import PropTypes from "prop-types";
import { Grid, Typography } from "@material-ui/core";

import Drawer from "../drawer";

import licenses from "../../data/licenses";

const LicenseInfo = ({ type, editor, defaultOpen }) => {
  return (
    type && (
      <Drawer heading="License" editor={editor} defaultOpen={defaultOpen}>
        <Grid container direction="row" alignItems="center">
          <Grid item xs={12} md={7}>
            <Typography color="secondary">
              The work presented here is licensed under a {"  "}
              <a
                href={licenses[type].link}
                target="_blank"
                rel="noreferrer noopener"
              >
                {licenses[type].title}
              </a>
            </Typography>
          </Grid>
          <Grid item xs={12} md={5}>
            <Grid
              container
              direction="row"
              alignItems="center"
              justify="center"
              spacing={2}
            >
              {licenses[type].infographics.map((image) => {
                return (
                  <Grid item key={image}>
                    <img src={"/images/" + image} />
                  </Grid>
                );
              })}
            </Grid>
          </Grid>
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
