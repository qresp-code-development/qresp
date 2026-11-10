import { useContext, useRef, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  Chip,
  ClickAwayListener,
  Divider,
  ListItemIcon,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  Typography,
} from "@mui/material";
import {
  AccountCircle,
  AdminPanelSettings,
  Article,
  EditNote,
  ExpandMore,
  Favorite as FavoriteIcon,
  Logout,
} from "@mui/icons-material";
import Link from "next/link";
import { useRouter } from "next/router";

import AuthContext from "../Context/Auth/authContext";
import { loginHref } from "../Utils/safeNext";
import { initialsOf } from "./Profile/ProfileLinks";

const pillSx = {
  color: "#800000",
  whiteSpace: "nowrap",
  backgroundColor: "#ffffff",
  borderRadius: "20px",
  px: 2,
  fontWeight: 600,
  textTransform: "none",
  "&:hover": {
    backgroundColor: "rgba(255,255,255,0.88)",
    boxShadow: "0 0 14px rgba(255,255,255,0.45)",
  },
};

const AuthControls = () => {
  const { loading, authenticated, user, logout } = useContext(AuthContext);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const closeTimer = useRef(null);

  const handleOpen = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 300);
  };
  const closeNow = () => {
    clearTimeout(closeTimer.current);
    setOpen(false);
  };

  if (loading) return null;

  if (authenticated) {
    const fullName = (user.name || "").trim() || user.email;
    const firstName = (user.name || "").trim().split(/\s+/)[0] || user.email.split("@")[0];
    const avatarSrc =
      typeof user.avatar_b64 === "string" && user.avatar_b64.startsWith("data:image/")
        ? user.avatar_b64
        : undefined;
    const initials = initialsOf(user.name, user.email);

    return (
      // Wrapping Box owns the hover region — button + menu are in the same
      // DOM subtree so onMouseLeave fires only when leaving the whole unit.
      <Box
        sx={{ display: "inline-block" }}
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
      >
        <ButtonBase
          ref={anchorRef}
          // Open, not toggle: hovering already opened the menu, so a toggle
          // would shut it on the very click meant to use it.
          onClick={handleOpen}
          aria-haspopup="true"
          aria-expanded={open ? "true" : undefined}
          aria-label={`Account menu for ${fullName}${user.is_admin ? " (admin)" : ""}`}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            pl: 0.5,
            pr: { xs: 0.5, sm: 1 },
            py: 0.5,
            borderRadius: "999px",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.35)",
            backgroundColor: open ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)",
            transition: "background-color 0.15s, border-color 0.15s",
            "&:hover": {
              backgroundColor: "rgba(255,255,255,0.16)",
              borderColor: "rgba(255,255,255,0.6)",
            },
          }}
        >
          <Avatar
            src={avatarSrc}
            alt=""
            sx={{
              width: 32,
              height: 32,
              fontSize: "0.85rem",
              fontWeight: 700,
              bgcolor: "#fff",
              color: "#800000",
            }}
          >
            {initials}
          </Avatar>
          <Typography
            component="span"
            sx={{
              display: { xs: "none", sm: "block" },
              fontWeight: 600,
              fontSize: "0.9rem",
              maxWidth: 110,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {firstName}
          </Typography>
          <ExpandMore
            fontSize="small"
            sx={{
              display: { xs: "none", sm: "block" },
              transition: "transform 0.2s",
              transform: open ? "rotate(180deg)" : "none",
            }}
          />
        </ButtonBase>
        {/* A Popper, not a Menu: Menu is a modal, and with disablePortal
            (needed so hover-out covers badge + menu) the modal marks the
            whole app — this menu included — aria-hidden while open. */}
        <Popper
          open={open}
          anchorEl={anchorRef.current}
          placement="bottom-end"
          disablePortal
          sx={{ zIndex: 1300 }}
        >
          <ClickAwayListener
            onClickAway={(e) => {
              // The badge itself is not "away": clicking it opens the menu.
              if (anchorRef.current && anchorRef.current.contains(e.target)) return;
              closeNow();
            }}
          >
            <Paper elevation={4} sx={{ mt: 0.75, minWidth: 240, borderRadius: 2 }}>
              <MenuList
                aria-label="Account"
                onKeyDown={(e) => {
                  if (e.key === "Escape" || e.key === "Tab") closeNow();
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, pt: 1, pb: 1.5 }}>
                  <Avatar
                    src={avatarSrc}
                    alt=""
                    sx={{ width: 40, height: 40, bgcolor: "#800000", fontWeight: 700, fontSize: "1rem" }}
                  >
                    {initials}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ maxWidth: 170 }}>
                        {fullName}
                      </Typography>
                      {user.is_admin && (
                        <Chip label="Admin" size="small" color="primary" sx={{ height: 18, fontSize: "0.65rem" }} />
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ maxWidth: 190 }}>
                      {user.email}
                    </Typography>
                  </Box>
                </Box>
                <Divider />
                <MenuItem component={Link} href="/account" onClick={closeNow}>
                  <ListItemIcon><AccountCircle fontSize="small" /></ListItemIcon>
                  My Profile
                </MenuItem>
                <MenuItem component={Link} href="/account/records" onClick={closeNow}>
                  <ListItemIcon><Article fontSize="small" /></ListItemIcon>
                  My Records
                </MenuItem>
                <MenuItem component={Link} href="/account/favorites" onClick={closeNow}>
                  <ListItemIcon><FavoriteIcon fontSize="small" /></ListItemIcon>
                  My Favorites
                </MenuItem>
                <MenuItem component={Link} href="/account/drafts" onClick={closeNow}>
                  <ListItemIcon><EditNote fontSize="small" /></ListItemIcon>
                  My Drafts
                </MenuItem>
                {user.is_admin && (
                  <MenuItem component={Link} href="/account/admin" onClick={closeNow}>
                    <ListItemIcon><AdminPanelSettings fontSize="small" /></ListItemIcon>
                    Admin
                  </MenuItem>
                )}
                <Divider />
                <MenuItem
                  onClick={() => { closeNow(); logout(); }}
                  sx={{ color: "error.main" }}
                >
                  <ListItemIcon><Logout fontSize="small" sx={{ color: "error.main" }} /></ListItemIcon>
                  Sign out
                </MenuItem>
              </MenuList>
            </Paper>
          </ClickAwayListener>
        </Popper>
      </Box>
    );
  }

  return (
    <Button
      size="large"
      sx={{ ...pillSx, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}
      component="a"
      href={loginHref((router && router.asPath) || "/")}
    >
      Sign in
    </Button>
  );
};

export default AuthControls;
