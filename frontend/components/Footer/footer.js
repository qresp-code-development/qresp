import { Box, Typography } from "@material-ui/core";

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
        style={style.upper}
        p={4}
      >
        <a href="http://miccom-center.org/" target="_blank" rel="noopener">
          <img
            src="/images/MICCoMLogo.png"
            height="48px"
            alt="Miccom Logo"
          ></img>
        </a>
        <a href="https://www.anl.gov/" target="_blank" rel="noopener">
          <img
            src="/images/ArgonneLogo.png"
            height="48px"
            alt="Argonne National Lab Logo"
          ></img>
        </a>
        <a href="https://www.uchicago.edu/" target="_blank" rel="noopener">
          <img
            src="/images/UchicagoLogo.png"
            height="48px"
            alt="University of Chicago Logo"
          ></img>
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
    </Box>
  );
};

export default Footer;
