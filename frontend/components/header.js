import { useState, Fragment } from "react";
import { useRouter } from "next/router";
import {
  AppBar,
  Toolbar,
  Box,
  Container,
  Button,
  Drawer,
} from "@mui/material";
import { styled } from "@mui/material/styles";

import { Menu } from "@mui/icons-material";

import StyledButton, { InternalStyledButton } from "./button";

import AuthControls from "./AuthControls";
import CuratorNavMenu from "./CuratorNavMenu";

import Link from "next/link";

const NavIcon = ({ children }) => (
  <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor"
    strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg"
    style={{ display: "block", transform: "translateY(-2px)" }}>
    {children}
  </svg>
);

const ExplorerIcon = (
  <NavIcon>
    <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="1.8" />
    <line x1="12.5" y1="12.5" x2="17.5" y2="17.5" strokeWidth="2.2" />
  </NavIcon>
);

const CuratorIcon = (
  <NavIcon>
    <g transform="translate(10,10) rotate(-45)">
      <rect x="-2" y="-7" width="4" height="3" rx="1" strokeWidth="1.6" />
      <line x1="-2.5" y1="-4" x2="2.5" y2="-4" strokeWidth="1.1" opacity="0.6" />
      <rect x="-2" y="-4" width="4" height="10" strokeWidth="1.6" />
      <polygon points="-2,6 2,6 0,11" strokeWidth="1.6" />
    </g>
  </NavIcon>
);

const DocumentIcon = (
  <NavIcon>
    <path d="M 4 1.5 L 13 1.5 L 16.5 5.5 L 16.5 18.5 L 3.5 18.5 L 3.5 1.5 Z" strokeWidth="1.7" />
    <path d="M 13 1.5 L 13 5.5 L 16.5 5.5" strokeWidth="1.5" />
    <line x1="6" y1="8.5" x2="14" y2="8.5" strokeWidth="1.3" />
    <line x1="6" y1="11.5" x2="14" y2="11.5" strokeWidth="1.3" />
    <line x1="6" y1="14.5" x2="11" y2="14.5" strokeWidth="1.3" />
  </NavIcon>
);

const MailIcon = (
  <NavIcon>
    <rect x="1.5" y="4.5" width="17" height="12" rx="1.5" strokeWidth="1.7" />
    <polyline points="1.5,4.5 10,12 18.5,4.5" strokeWidth="1.5" />
  </NavIcon>
);

// Defined at module scope (not per-render) with the paper slot styled via its
// global class, since withStyles' classes map is gone in MUI v5+.
const StyledDrawer = styled(Drawer)({
  "& .MuiDrawer-paper": {
    backgroundColor: "#800000",
  },
});

const Header = () => {
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useRouter();

  const isActive = (url) => {
    if (url === "/explorer") return pathname === "/explorer" || pathname === "/search";
    return pathname === url || (pathname || "").startsWith(url + "/");
  };

  const handleOpen = () => {
    setDrawer(true);
  };

  const toggleDrawer = (event) => {
    if (
      event &&
      event.type === "keydown" &&
      (event.key === "Tab" || event.key === "Shift")
    ) {
      return;
    }
    setDrawer(!drawer);
  };

  // Navigation only — the auth control is deliberately NOT part of this, so
  // it never disappears into the drawer.
  const links = (
    <Fragment>
      <InternalStyledButton text="Explorer" url="/explorer" active={isActive("/explorer")} icon={ExplorerIcon} />
      {/* Hovering lists each kind of work to curate; clicking opens the
          curator's own chooser. */}
      <CuratorNavMenu text="Curator" active={isActive("/curator")} icon={CuratorIcon} />
      {/* Both are pages now, not jumps out of the app.
          Documentation was an external link to qresp.org and Contact was a
          bare `mailto:` — a navigation item that handed the page to a mail
          client, and did nothing at all on a machine with none configured. */}
      <InternalStyledButton text="Documentation" url="/documentation" active={isActive("/documentation")} icon={DocumentIcon} />
      <InternalStyledButton text="Contact" url="/contact" active={isActive("/contact")} icon={MailIcon} />
    </Fragment>
  );

  return (
    <AppBar position="sticky" color="primary" elevation={0}>
      <Toolbar>
        {/* xl gives the inline row room to breathe; the auth control sits
            outside it and shows at every width. */}
        <Container maxWidth="xl">
          {/* The row WRAPS: on a phone the logo plus a signed-in name,
              Sign out and the menu button are wider than the bar, and a row
              that cannot wrap widened the whole page instead. The controls
              then take a line of their own, still right-aligned. */}
          <Box sx={{ display: "flex", flexDirection: "row", flexWrap: "wrap", flexGrow: 1, minWidth: 0, width: "100%", alignItems: "center", m: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", flexGrow: 1, minWidth: 0 }}>
              <Button
                component={Link}
                href="/"
                sx={{
                  transition: "filter 0.25s ease",
                  alignItems: "center",
                  "&:hover": {
                    filter: "drop-shadow(0 0 10px rgba(255,255,255,0.8))",
                    backgroundColor: "transparent",
                  },
                  "& .qr-hdr-tagline": {
                    display: "inline-block",
                    whiteSpace: "nowrap",
                    clipPath: "inset(0 100% 0 0)",
                    opacity: 0,
                    transition: "clip-path 0.55s ease-out, opacity 0.35s ease",
                    fontSize: "0.9rem",
                    fontStyle: "italic",
                    fontWeight: 300,
                    letterSpacing: "0.03em",
                    color: "rgba(255,255,255,0.85)",
                    marginLeft: "10px",
                    verticalAlign: "middle",
                  },
                  "&:hover .qr-hdr-tagline": {
                    clipPath: "inset(0 0% 0 0)",
                    opacity: 1,
                  },
                }}
              >
                <svg
                  viewBox="0 0 350 105"
                  width="167"
                  height="50"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-label="Qresp"
                  role="img"
                  style={{ userSelect: "none", display: "block" }}
                >
                  <circle cx="40" cy="40" r="35" stroke="white" strokeWidth="8" />
                  <path d="M 17 35 Q 21 18 38 17" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  <path d="M 63 72 L 78 93" stroke="white" strokeWidth="10" strokeLinecap="round" fill="none" />
                  <g transform="translate(92, 51) scale(1.262)">
                    <rect x="-4" y="-23" width="8" height="7" rx="2" fill="none" stroke="white" strokeWidth="2.5" />
                    <line x1="-5" y1="-16" x2="5" y2="-16" stroke="rgba(255,255,255,0.50)" strokeWidth="1.5" />
                    <rect x="-4" y="-16" width="8" height="25" fill="none" stroke="white" strokeWidth="2.5" />
                    <polygon points="-4,9 4,9 0,19" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
                  </g>
                  <path d="M 97 31 C 104 22 113 22 120 31" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none" />
                  <text x="122" y="75" fontFamily="'Nunito', Arial, sans-serif" fontSize="104" fontWeight="200" fill="white" style={{ textTransform: "none" }}>esp</text>
                </svg>
                <span className="qr-hdr-tagline">— Curation and Exploration of Reproducible Scientific Papers</span>
              </Button>
            </Box>
            <Box
              data-testid="header-controls"
              sx={{ display: "flex", alignItems: "center", flexWrap: "nowrap", maxWidth: "100%", ml: "auto" }}
            >
              {/* MUI v6+ removed <Hidden>; use responsive display instead.
                  Navigation collapses into the drawer below lg. */}
              <Box
                sx={{
                  display: { xs: "none", lg: "flex" },
                  alignItems: "center",
                  flexWrap: "nowrap",
                }}
              >
                {links}
              </Box>
              {/* Auth stays OUTSIDE the drawer at every width: signing in must
                  never be something the visitor has to hunt for behind a
                  hamburger. It is one short control, so it fits. */}
              <AuthControls />
              <Box sx={{ display: { xs: "flex", lg: "none" } }}>
                <StyledButton aria-label="Open navigation menu" onClick={handleOpen}>
                  <Menu />
                </StyledButton>
              </Box>
            </Box>
          </Box>
        </Container>
      </Toolbar>
      <StyledDrawer anchor="top" open={drawer} onClose={toggleDrawer}>
        <Box onClick={toggleDrawer} sx={{ display: "flex", flexDirection: "column" }}>
          {links}
        </Box>
      </StyledDrawer>
    </AppBar>
  );
};

export default Header;
