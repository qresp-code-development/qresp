import { AppBar, Toolbar, Box, Container, Button } from "@material-ui/core";
import StyledButton from "../button";
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
            <Box display="flex">
              <StyledButton text="Explorer" url="/explorer" />
              <StyledButton text="Curator" url="/curator" />
              <StyledButton
                text="Documentation"
                url="https://qresp.org"
                external={true}
              />
              <StyledButton text="Contact" url="/contact" />
              <StyledButton text="LogIn" url="/login" />
            </Box>
          </Box>
        </Container>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
