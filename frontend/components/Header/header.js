import { useState, Fragment } from "react";
import {
  AppBar,
  Toolbar,
  Box,
  Container,
  Button,
  Hidden,
  SwipeableDrawer,
} from "@material-ui/core";

import { Menu } from "@material-ui/icons";

import StyledButton, {
  InternalStyledButton,
  ExternalStyledButton,
} from "../button";
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

  const links = (
    <Fragment>
      {" "}
      <InternalStyledButton text="Explorer" url="/explorer" />
      <InternalStyledButton text="Curator" url="/curator" />
      <ExternalStyledButton
        text="Documentation"
        url="https://qresp.org"
        external={true}
      />
      <InternalStyledButton text="Contact" url="/contact" />
      <InternalStyledButton text="LogIn" url="/login" />
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
            m={2}
          >
            <Box display="flex" alignItems="center" flexGrow={1} m={1}>
              <Link href="/">
                <Button>
                  <img
                    src="/images/Qresp-logo.png"
                    height="64px"
                    alt="Qresp Logo"
                  ></img>
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
      <SwipeableDrawer
        anchor="top"
        open={drawer}
        onClose={toggleDrawer}
        onOpen={toggleDrawer}
      >
        A
      </SwipeableDrawer>
    </AppBar>
  );
};

export default Header;
