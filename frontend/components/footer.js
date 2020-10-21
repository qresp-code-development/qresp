import { Box, Typography } from "@material-ui/core";
import Picture from "./picture";

const Footer = () => {
  const style = {
    upper: {
      backgroundColor: "#2c3e50",
    },
    lower: {
      backgroundColor: "#1a252f",
    },
  };

  return (
    <Box display="flex" flexDirection="column">
      <Box
        display="flex"
        flexDirection="row"
        alignItems="center"
        justifyContent="space-evenly"
        flexWrap="wrap"
        style={style.upper}
        p={4}
      >
        <a href="http://miccom-center.org/" target="_blank" rel="noopener">
          <Picture
            imgSrc="/images/MICCoMLogo"
            imgAlt="Miccom Logo"
            height="48px"
          />
        </a>
        <a href="https://www.anl.gov/" target="_blank" rel="noopener">
          <Picture
            imgSrc="/images/ArgonneLogo"
            imgAlt="Miccom Logo"
            height="48px"
          />
        </a>
        <a href="https://www.uchicago.edu/" target="_blank" rel="noopener">
          <Picture
            imgSrc="/images/UchicagoLogo"
            imgAlt="Miccom Logo"
            height="48px"
          />
        </a>
      </Box>
      <Box
        display="flex"
        flexDirection="row"
        alignItems="center"
        justifyContent="center"
        style={style.lower}
        p={1}
      >
        <Typography variant="overline" color="secondary">
          Copyright ©2018-2020 All Rights Reserved
        </Typography>
      </Box>
      <style jsx>
        {`
          a {
            margin: 16px;
          }
        `}
      </style>
    </Box>
  );
};

export default Footer;
