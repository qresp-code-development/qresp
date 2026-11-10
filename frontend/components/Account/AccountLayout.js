import { useContext } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Avatar,
  Box,
  Chip,
  Container,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  AccountCircle,
  AdminPanelSettings,
  Article,
  EditNote,
  Favorite,
} from "@mui/icons-material";
import AuthContext from "../../Context/Auth/authContext";

const SIDEBAR_WIDTH = 220;

const NAV = [
  { label: "Profile", href: "/account", icon: AccountCircle, exact: true },
  { label: "My Records", href: "/account/records", icon: Article },
  { label: "Favorites", href: "/account/favorites", icon: Favorite },
  { label: "Drafts", href: "/account/drafts", icon: EditNote },
];

const ADMIN_NAV = [
  { label: "Admin", href: "/account/admin", icon: AdminPanelSettings },
];

const isActive = (href, exact, pathname) =>
  exact ? pathname === href : pathname.startsWith(href);

const AccountLayout = ({ children, pageTitle }) => {
  const { user } = useContext(AuthContext);
  const { pathname } = useRouter();
  const isAdmin = Boolean(user?.is_admin);
  const allItems = isAdmin ? [...NAV, ...ADMIN_NAV] : NAV;

  const initials = (user?.name || user?.email || "?")
    .split(/\s+/)
    .map((w) => w[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const activeIdx = allItems.findIndex((item) =>
    isActive(item.href, item.exact, pathname)
  );

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 8 }}>
      <Box sx={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
        {/* ── Sidebar (desktop) ────────────────────────────────────── */}
        <Box
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            display: { xs: "none", md: "block" },
          }}
        >
          <Paper
            variant="outlined"
            sx={{ p: 2.5, mb: 2, borderRadius: 3 }}
          >
            <Avatar
              src={user?.avatar_b64 || undefined}
              sx={{
                width: 52,
                height: 52,
                bgcolor: "#800000",
                fontSize: "1.2rem",
                fontWeight: 700,
                mb: 1.5,
              }}
            >
              {initials}
            </Avatar>
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              {user?.name || "—"}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              noWrap
              sx={{ mb: isAdmin ? 1 : 0 }}
            >
              {user?.email}
            </Typography>
            {isAdmin && (
              <Chip label="Admin" size="small" color="primary" />
            )}
          </Paper>

          <List disablePadding>
            {allItems.map(({ label, href, icon: Icon, exact }) => {
              const active = isActive(href, exact, pathname);
              return (
                <ListItem key={href} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    component={Link}
                    href={href}
                    selected={active}
                    sx={{
                      borderRadius: 2,
                      py: 0.9,
                      "&.Mui-selected": {
                        bgcolor: "rgba(128,0,0,0.1)",
                        color: "#800000",
                      },
                      "&.Mui-selected .MuiListItemIcon-root": {
                        color: "#800000",
                      },
                      "&:hover": { bgcolor: "rgba(128,0,0,0.06)" },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Icon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={label}
                      slotProps={{
                        primary: {
                          sx: { fontWeight: active ? 700 : 400, fontSize: "0.875rem" },
                        },
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>

        {/* ── Content ─────────────────────────────────────────────── */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Mobile tab bar */}
          <Box sx={{ display: { xs: "block", md: "none" }, mb: 3 }}>
            <Tabs
              value={activeIdx < 0 ? 0 : activeIdx}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ "& .MuiTab-root": { textTransform: "none", fontWeight: 600, minHeight: 48 } }}
            >
              {allItems.map(({ label, href, icon: Icon }) => (
                <Tab
                  key={href}
                  label={label}
                  icon={<Icon fontSize="small" />}
                  iconPosition="start"
                  component={Link}
                  href={href}
                />
              ))}
            </Tabs>
          </Box>

          {pageTitle && (
            <Typography
              variant="h5"
              fontWeight={700}
              gutterBottom
              sx={{ mb: 3 }}
            >
              {pageTitle}
            </Typography>
          )}
          {children}
        </Box>
      </Box>
    </Container>
  );
};

export default AccountLayout;
