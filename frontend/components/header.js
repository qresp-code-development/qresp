import { useState, Fragment } from "react";
import {
  AppBar,
  Toolbar,
  Box,
  Container,
  Button,
  Hidden,
  Drawer,
} from "@material-ui/core";
import { withStyles } from "@material-ui/core/styles";

import { Menu } from "@material-ui/icons";

import StyledButton, {
  InternalStyledButton,
  ExternalStyledButton,
} from "./button";

import Picture from "./picture";

import Link from "next/link";

const Header = () => {
  const [drawer, setDrawer] = useState(false);

  const handleOpen = () => {
    setDrawer(true);
  };

  const toggleDrawer = () => {
    if (
      event &&
      event.type === "keydown" &&
      (event.key === "Tab" || event.key === "Shift")
    ) {
      return;
    }
    setDrawer(!drawer);
  };

  const StyledDrawer = withStyles({
    paper: {
      backgroundColor: "#800000",
    },
  })(Drawer);

  const links = (
    <Fragment>
      <InternalStyledButton text="Explorer" url="/explorer" />
      <InternalStyledButton text="Curator" url="/curator" />
      <ExternalStyledButton
        text="Documentation"
        url="https://qresp.org"
        external={true}
      />
      <ExternalStyledButton
        text="Contact"
        url="mailto:datadev@lists.uchicago.edu?subject=Qresp"
        external={true}
      />
      {/* <InternalStyledButton text="LogIn" url="/login" /> */}
    </Fragment>
  );

  return (
    <AppBar position="sticky" color="primary" elevation={0}>
      <Toolbar>
        <Container>
          <Box
            display="flex"
            flexDirection="row"
            flexGrow={1}
            alignItems="center"
            m={1}
          >
            <Box display="flex" alignItems="center" flexGrow={1}>
              <Link href="/">
                <Button>
                  <Picture
                    imgSrc="/images/qrespLogo"
                    imgAlt="Qresp Logo"
                    height="64px"
                  />
                </Button>
              </Link>
            </Box>
            <Box display="flex">
              <Hidden smDown>{links}</Hidden>
              <Hidden mdUp>
                <StyledButton onClick={handleOpen}>
                  <Menu />
                </StyledButton>
              </Hidden>
            </Box>
          </Box>
        </Container>
      </Toolbar>
      <StyledDrawer anchor="top" open={drawer} onClose={toggleDrawer}>
        <Box display="flex" flexDirection="column" onClick={toggleDrawer}>
          {links}
        </Box>
      </StyledDrawer>
    </AppBar>
  );
};

export default Header;
