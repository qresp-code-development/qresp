import { useRef, useState } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { useRouter } from "next/router";

import { Box, Grow, Paper, Popper, Typography } from "@mui/material";

import { InternalStyledButton } from "./button";
import { WORK_TYPE_ICONS } from "./CuratorElements/WorkTypeChooser";
import { WORK_TYPES, WORK_TYPE_KEYS } from "../Utils/workTypes";

// The header's "Curator" item. Clicking it opens the curator's own "What are
// you curating?" step -- also from a new record's forms, where a plain
// "/curator" link would be a no-op (same page), so it asks the page to start
// over at the chooser (?choose=1, see ChooserFromQuery). Hovering (or focusing) it lists the same choices so a
// curator can jump straight into one. The menu is rendered inside the hover
// area (no portal) so moving the pointer from the button into it keeps it
// open.
const CuratorNavMenu = ({ text, active, icon }) => {
  const anchor = useRef(null);
  const closeTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const onNewRecord =
    router && router.pathname === "/curator" && !(router.query && router.query.edit);
  const url = onNewRecord ? "/curator?choose=1" : "/curator";

  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // A short grace period so crossing the gap between button and menu does
  // not close it.
  const hide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <Box
      ref={anchor}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) hide();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
      sx={{ display: "inline-flex", position: "relative" }}
      data-testid="curator-nav"
    >
      <InternalStyledButton text={text} url={url} active={active} icon={icon} />
      <Popper
        open={open}
        anchorEl={anchor.current}
        placement="bottom-start"
        disablePortal
        transition
        sx={{ zIndex: 1300 }}
      >
        {({ TransitionProps }) => (
          <Grow {...TransitionProps} style={{ transformOrigin: "top left" }} timeout={150}>
            <Paper
              elevation={8}
              role="menu"
              aria-label="Start curating"
              data-testid="curator-nav-menu"
              sx={{ mt: 0.5, p: 1, width: 360, borderRadius: 2 }}
            >
              <Typography
                variant="overline"
                component="div"
                sx={{ px: 1.5, pt: 0.5, color: "text.secondary", letterSpacing: "0.1em" }}
              >
                What are you curating?
              </Typography>
              {WORK_TYPE_KEYS.map((type) => {
                const Icon = WORK_TYPE_ICONS[type];
                const { label, description } = WORK_TYPES[type];
                return (
                  <Box
                    key={type}
                    component={Link}
                    href={`/curator?type=${type}`}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    data-testid={`curator-nav-${type}`}
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1.5,
                      color: "text.primary",
                      textDecoration: "none",
                      "&:hover, &:focus-visible": { bgcolor: "rgba(128,0,0,0.06)", outline: "none" },
                    }}
                  >
                    <Icon sx={{ color: "#800000", mt: 0.25 }} fontSize="small" />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700}>
                        {label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.4 }}>
                        {description}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Paper>
          </Grow>
        )}
      </Popper>
    </Box>
  );
};

CuratorNavMenu.propTypes = {
  text: PropTypes.string.isRequired,
  active: PropTypes.bool,
  icon: PropTypes.node,
};

export default CuratorNavMenu;
