import PropTypes from "prop-types";

import { Grid, Typography } from "@material-ui/core";

import Drawer from "../drawer";

const licenses = {
  cco: {
    title: "Creative Commons Zero v1.0 Universal",
    link: "https://creativecommons.org/publicdomain/zero/1.0/",
    infographics: ["cc.svg", "zero.svg"],
  },
  cc_by: {
    title: "Creative Commons Attribution 4.0 International License",
    link: "https://creativecommons.org/licenses/by/4.0/",
    infographics: ["cc.svg", "by.svg"],
  },
  cc_by_nc: {
    title:
      "Creative Commons Attribution NonCommercial 4.0 International License",
    link: "https://creativecommons.org/licenses/by-nc/4.0/",
    infographics: ["cc.svg", "by.svg", "nc.svg"],
  },
  cc_by_sa: {
    title: "Creative Commons Attribution ShareAlike 4.0 International License",
    link: "https://creativecommons.org/licenses/by-sa/4.0/",
    infographics: ["cc.svg", "by.svg", "sa.svg"],
  },
  cc_by_nd: {
    title:
      "Creative Commons Attribution NoDerivatives 4.0 International License",
    link: "https://creativecommons.org/licenses/by-nd/4.0/",
    infographics: ["cc.svg", "by.svg", "nd.svg"],
  },
  cc_by_nc_sa: {
    title:
      "Creative Commons Attribution NonCommercial ShareAlike 4.0 International License",
    link: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    infographics: ["cc.svg", "by.svg", "nc.svg", "sa.svg"],
  },
  cc_by_nc_nd: {
    title:
      "Creative Commons Attribution NonCommercial NoDerivatives 4.0 International License",
    link: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    infographics: ["cc.svg", "by.svg", "nc.svg", "nd.svg"],
  },
};

const LicenseInfo = ({ type }) => {
  console.log(licenses[type], type);
  return (
    <Drawer heading="License">
      <Grid container direction="row" alignItems="center">
        <Grid item xs={12} md={7}>
          <Typography color="secondary">
            The work presented here is licensed under a{" "}
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
              console.log(image);
              return (
                <Grid item>
                  <img src={"/images/" + image} />
                </Grid>
              );
            })}
          </Grid>
        </Grid>
      </Grid>
    </Drawer>
  );
};

LicenseInfo.propTypes = {
  license: PropTypes.string.isRequired,
};

export default LicenseInfo;
