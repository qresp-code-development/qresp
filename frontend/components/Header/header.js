import { AppBar, Toolbar, Box, Container, Button } from "@material-ui/core";
import { InternalStyledButton, ExternalStyledButton } from "../button";
import Link from "next/link";

const Header = () => {
  return (
    <AppBar position="sticky" color="primary" elevation={0}>
      <Toolbar>
        <Container>
          <Box
            display="flex"
            flexDirection="row"
            m={2}
            flexGrow={1}
            alignItems="center"
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
            <InternalStyledButton text="Explorer" url="/explorer" />
            <InternalStyledButton text="Curator" url="/curator" />
            <ExternalStyledButton
              text="Documentation"
              url="https://qresp.org"
              external={true}
            />
            <InternalStyledButton text="Contact" url="/contact" />
            <InternalStyledButton text="LogIn" url="/login" />
          </Box>
        </Container>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
