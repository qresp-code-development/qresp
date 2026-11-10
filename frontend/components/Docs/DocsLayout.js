import { Fragment } from "react";

import NextLink from "next/link";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Container,
  Link as MuiLink,
  Typography,
} from "@mui/material";
import { ExpandMore } from "@mui/icons-material";

import SEO from "../seo";
import { DOCS_NAV, neighbours } from "./nav";

// The frame every documentation page sits in: a table of contents on the
// left, the page on the right, previous / next at the foot.
//
// The current page is passed in as `href` rather than read from the router,
// so a page renders the same under test as it does in the browser, and the
// highlighted entry is always the one the page says it is.

const MAROON = "#800000";

const NavList = ({ current, label }) => (
  <Box component="nav" aria-label={label}>
    {DOCS_NAV.map((section) => (
      <Box key={section.group} sx={{ mb: 2.5 }}>
        <Typography
          variant="overline"
          component="p"
          sx={{
            color: "text.secondary",
            fontWeight: 700,
            letterSpacing: "0.1em",
            lineHeight: 1.6,
            mb: 0.5,
            px: 1.5,
          }}
        >
          {section.group}
        </Typography>
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
          {section.pages.map((page) => {
            const active = page.href === current;
            return (
              <Box component="li" key={page.href}>
                <MuiLink
                  component={NextLink}
                  href={page.href}
                  underline="none"
                  aria-current={active ? "page" : undefined}
                  sx={{
                    display: "block",
                    px: 1.5,
                    py: 0.75,
                    borderLeft: "3px solid",
                    borderColor: active ? MAROON : "transparent",
                    borderRadius: "0 6px 6px 0",
                    fontSize: "0.9rem",
                    fontWeight: active ? 700 : 500,
                    color: active ? MAROON : "text.primary",
                    bgcolor: active ? "rgba(128,0,0,0.06)" : "transparent",
                    transition: "background-color 0.15s ease, color 0.15s ease",
                    "&:hover": { color: MAROON, bgcolor: "rgba(128,0,0,0.04)" },
                  }}
                >
                  {page.title}
                </MuiLink>
              </Box>
            );
          })}
        </Box>
      </Box>
    ))}
  </Box>
);

const PagerLink = ({ page, direction }) => (
  <MuiLink
    component={NextLink}
    href={page.href}
    underline="none"
    data-testid={`docs-${direction}`}
    sx={{
      flex: 1,
      minWidth: 0,
      border: 1,
      borderColor: "divider",
      borderRadius: 2,
      px: 2.5,
      py: 1.5,
      textAlign: direction === "next" ? "right" : "left",
      transition: "border-color 0.15s ease",
      "&:hover": { borderColor: MAROON },
    }}
  >
    <Typography variant="caption" color="text.secondary" display="block">
      {direction === "next" ? "Next" : "Previous"}
    </Typography>
    <Typography variant="subtitle2" sx={{ color: MAROON, fontWeight: 700 }}>
      {direction === "next" ? `${page.title} →` : `← ${page.title}`}
    </Typography>
  </MuiLink>
);

const DocsLayout = ({ href, title, description, children }) => {
  const { previous, next } = neighbours(href);

  return (
    <Fragment>
      <SEO title={`Qresp | ${title}`} description={description} />
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "250px minmax(0, 1fr)" },
            gap: { xs: 2, md: 6 },
            my: { xs: 3, md: 6 },
          }}
        >
          {/* Desktop: a sticky table of contents. */}
          <Box sx={{ display: { xs: "none", md: "block" } }}>
            <Box sx={{ position: "sticky", top: 88 }}>
              <NavList current={href} label="Documentation" />
            </Box>
          </Box>

          {/* Narrow screens: the same contents, folded away above the page. */}
          <Box sx={{ display: { xs: "block", md: "none" } }}>
            <Accordion
              disableGutters
              elevation={0}
              sx={{ border: 1, borderColor: "divider", borderRadius: 2, "&:before": { display: "none" } }}
            >
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Documentation contents
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <NavList current={href} label="Documentation contents" />
              </AccordionDetails>
            </Accordion>
          </Box>

          <Box component="article" sx={{ minWidth: 0, maxWidth: 820 }}>
            {children}

            {previous || next ? (
              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  mt: 6,
                  pt: 3,
                  borderTop: 1,
                  borderColor: "divider",
                  flexDirection: { xs: "column", sm: "row" },
                }}
              >
                {previous ? <PagerLink page={previous} direction="previous" /> : <Box sx={{ flex: 1 }} />}
                {next ? <PagerLink page={next} direction="next" /> : <Box sx={{ flex: 1 }} />}
              </Box>
            ) : null}
          </Box>
        </Box>
      </Container>
    </Fragment>
  );
};

export default DocsLayout;
