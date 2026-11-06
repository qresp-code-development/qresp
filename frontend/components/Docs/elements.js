import { useState } from "react";

import NextLink from "next/link";
import {
  Box,
  Button,
  Link as MuiLink,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  CheckCircleOutlined,
  ContentCopy,
  DescriptionOutlined,
  ErrorOutlined,
  FolderOpenOutlined,
  InfoOutlined,
  LightbulbOutlined,
  ReportProblemOutlined,
  SettingsOutlined,
} from "@mui/icons-material";

// The building blocks every documentation page is written in.
//
// Pages are prose; these keep the typography, spacing and the maroon accent
// identical from one page to the next, so a page reads as part of the same
// manual rather than as a one-off.

const MAROON = "#800000";

const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

// `noopener` denies the opened page a handle on this one; `noreferrer` keeps
// the referring URL out of the request.
export const ExternalLink = ({ href, children }) => (
  <MuiLink href={href} target="_blank" rel="noopener noreferrer" underline="hover">
    {children}
    <Box component="span" sx={visuallyHidden}>
      {" (opens in a new tab)"}
    </Box>
  </MuiLink>
);

export const DocLink = ({ href, children, ...rest }) => (
  <MuiLink component={NextLink} href={href} underline="hover" {...rest}>
    {children}
  </MuiLink>
);

export const PageTitle = ({ eyebrow, title, children }) => (
  <Box sx={{ mb: 4 }}>
    {eyebrow ? (
      <Typography
        variant="overline"
        sx={{ color: MAROON, fontWeight: 700, letterSpacing: "0.12em" }}
      >
        {eyebrow}
      </Typography>
    ) : null}
    <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: children ? 2 : 0 }}>
      {title}
    </Typography>
    {children ? (
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{ fontSize: "1.075rem", lineHeight: 1.75 }}
      >
        {children}
      </Typography>
    ) : null}
  </Box>
);

const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const Section = ({ title, id, children }) => (
  <Box component="section" sx={{ mb: 5 }} id={id || slug(title)}>
    <Typography
      variant="h5"
      component="h2"
      sx={{
        fontWeight: 700,
        color: MAROON,
        pb: 1,
        mb: 2.5,
        borderBottom: 1,
        borderColor: "divider",
        scrollMarginTop: "80px",
      }}
    >
      {title}
    </Typography>
    {children}
  </Box>
);

export const SubSection = ({ title, children }) => (
  <Box sx={{ mb: 3.5 }} id={slug(title)}>
    <Typography
      variant="h6"
      component="h3"
      sx={{ fontWeight: 700, mb: 1.25, scrollMarginTop: "80px" }}
    >
      {title}
    </Typography>
    {children}
  </Box>
);

export const P = ({ children, sx }) => (
  <Typography
    variant="body1"
    color="text.secondary"
    sx={{ mb: 2, lineHeight: 1.75, ...sx }}
  >
    {children}
  </Typography>
);

export const Bullets = ({ items, ordered = false, dense = false }) => (
  <Box
    component={ordered ? "ol" : "ul"}
    sx={{ pl: 3, mt: dense ? 1 : 0, mb: dense ? 1 : 2.5, "& li": { mb: dense ? 0.5 : 1 } }}
  >
    {items.map((item, index) => (
      <Typography
        component="li"
        variant={dense ? "body2" : "body1"}
        color="text.secondary"
        key={index}
        sx={{ lineHeight: 1.7 }}
      >
        {item}
      </Typography>
    ))}
  </Box>
);

// A labelled list: the field name in bold, then what it means. Used for form
// fields, folder roles and node types, which are all "term — description".
export const Fields = ({ items }) => (
  <Box
    component="dl"
    sx={{
      m: 0,
      mb: 2.5,
      border: 1,
      borderColor: "divider",
      borderRadius: 2,
      overflow: "hidden",
    }}
  >
    {items.map(([term, description], index) => (
      <Box
        key={index}
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "200px 1fr" },
          gap: { xs: 0.5, sm: 2 },
          px: 2.5,
          py: 1.5,
          borderTop: index === 0 ? 0 : 1,
          borderColor: "divider",
          bgcolor: index % 2 ? "rgba(0,0,0,0.015)" : "transparent",
        }}
      >
        <Typography component="dt" variant="body2" sx={{ fontWeight: 700 }}>
          {term}
        </Typography>
        <Typography
          component="dd"
          variant="body2"
          color="text.secondary"
          sx={{ m: 0, lineHeight: 1.7 }}
        >
          {description}
        </Typography>
      </Box>
    ))}
  </Box>
);

export const Code = ({ children }) => (
  <Box
    component="code"
    sx={{
      fontFamily: "monospace",
      fontSize: "0.9em",
      px: 0.6,
      py: 0.15,
      borderRadius: 0.75,
      bgcolor: "rgba(128,0,0,0.06)",
      color: "#5c0000",
    }}
  >
    {children}
  </Box>
);

// A command or file listing. Copy failure (plain HTTP, some browsers) is
// expected, and says what to do instead rather than failing silently.
export const CodeBlock = ({ children, label }) => {
  const [state, setState] = useState("");
  const text = String(children).replace(/^\n+|\s+$/g, "");

  const copy = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(text);
      setState("Copied");
    } catch (err) {
      setState("Select the text to copy");
    }
  };

  return (
    <Box
      sx={{
        mb: 2.5,
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid #2c3e50",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          bgcolor: "#2c3e50",
          px: 2,
          py: 0.5,
        }}
      >
        <Typography
          variant="caption"
          sx={{ color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}
        >
          {label || "shell"}
        </Typography>
        <Button
          size="small"
          onClick={copy}
          startIcon={<ContentCopy sx={{ fontSize: 14 }} />}
          sx={{ color: "rgba(255,255,255,0.85)", textTransform: "none", fontSize: "0.75rem" }}
          aria-label={`Copy ${label || "code"}`}
        >
          {state || "Copy"}
        </Button>
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          bgcolor: "#1a252f",
          color: "#e8eef3",
          fontFamily: "monospace",
          fontSize: "0.85rem",
          lineHeight: 1.65,
          overflowX: "auto",
        }}
      >
        {text}
      </Box>
    </Box>
  );
};

const CALLOUTS = {
  tip: { label: "Tip", color: "#2e7d32", bg: "rgba(46,125,50,0.06)", Icon: LightbulbOutlined },
  info: { label: "Info", color: "#1565c0", bg: "rgba(21,101,192,0.06)", Icon: InfoOutlined },
  note: { label: "Note", color: "#455a64", bg: "rgba(69,90,100,0.06)", Icon: CheckCircleOutlined },
  warning: { label: "Warning", color: "#b26a00", bg: "rgba(237,108,2,0.07)", Icon: ReportProblemOutlined },
  important: { label: "Important", color: MAROON, bg: "rgba(128,0,0,0.05)", Icon: ErrorOutlined },
};

export const Callout = ({ kind = "info", title, children }) => {
  const { label, color, bg, Icon } = CALLOUTS[kind];
  return (
    <Box
      role="note"
      sx={{
        display: "flex",
        gap: 1.5,
        borderLeft: `4px solid ${color}`,
        bgcolor: bg,
        borderRadius: "0 8px 8px 0",
        px: 2.5,
        py: 1.75,
        mb: 3,
      }}
    >
      <Icon sx={{ color, fontSize: 22, mt: 0.15, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ color, fontWeight: 700, mb: 0.25 }}>
          {title || label}
        </Typography>
        <Typography
          component="div"
          variant="body2"
          color="text.secondary"
          sx={{ lineHeight: 1.7 }}
        >
          {children}
        </Typography>
      </Box>
    </Box>
  );
};

export const DataTable = ({ columns, rows, caption }) => (
  <TableContainer
    sx={{ mb: 3, border: 1, borderColor: "divider", borderRadius: 2 }}
  >
    <Table size="small" aria-label={caption}>
      <TableHead>
        <TableRow sx={{ bgcolor: MAROON }}>
          {columns.map((column) => (
            <TableCell
              key={column}
              sx={{ color: "white", fontWeight: 700, borderBottom: 0, py: 1.25 }}
            >
              {column}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={index} sx={{ "&:last-child td": { borderBottom: 0 } }}>
            {row.map((cell, cellIndex) => (
              <TableCell key={cellIndex} sx={{ py: 1.25 }}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);

export const Figure = ({ src, alt, caption, maxWidth = "100%" }) => (
  <Box component="figure" sx={{ m: 0, mb: 3.5 }}>
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        p: { xs: 1.5, sm: 3 },
        bgcolor: "white",
        textAlign: "center",
      }}
    >
      <Box
        component="img"
        src={src}
        alt={alt}
        sx={{ maxWidth, width: "100%", height: "auto" }}
      />
    </Box>
    {caption ? (
      <Typography
        component="figcaption"
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 1, textAlign: "center" }}
      >
        {caption}
      </Typography>
    ) : null}
  </Box>
);

// A drawn folder tree: [depth, name, kind] rows, kind one of folder / file /
// config. Text, not an image, so it stays selectable and readable at any size.
export const Tree = ({ entries, label }) => (
  <Box
    aria-label={label}
    sx={{
      border: 1,
      borderColor: "divider",
      borderRadius: 2,
      p: 2,
      mb: 3,
      bgcolor: "action.hover",
      overflowX: "auto",
    }}
  >
    {entries.map(([depth, name, kind], index) => {
      const Icon =
        kind === "folder" ? FolderOpenOutlined : kind === "config" ? SettingsOutlined : DescriptionOutlined;
      return (
        <Box
          key={index}
          sx={{ display: "flex", alignItems: "center", pl: depth * 2.5, py: 0.2 }}
        >
          <Icon
            sx={{
              fontSize: 17,
              mr: 0.85,
              color: kind === "folder" ? "primary.main" : "text.secondary",
            }}
          />
          <Typography
            variant="body2"
            sx={{ fontFamily: "monospace", whiteSpace: "nowrap", fontWeight: depth === 0 ? 700 : 400 }}
          >
            {name}
          </Typography>
        </Box>
      );
    })}
  </Box>
);

// The grid of linked cards used by the overview pages.
export const CardGrid = ({ cards }) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
      gap: 2,
      mb: 4,
    }}
  >
    {cards.map(({ href, title, description, step }) => (
      <MuiLink
        key={href}
        component={NextLink}
        href={href}
        underline="none"
        sx={{
          display: "block",
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          p: 2.5,
          color: "inherit",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease",
          "&:hover, &:focus-visible": {
            borderColor: MAROON,
            boxShadow: "0 6px 18px rgba(128,0,0,0.12)",
            transform: "translateY(-2px)",
          },
        }}
      >
        {step ? (
          <Typography variant="overline" sx={{ color: MAROON, fontWeight: 700, lineHeight: 1.5 }}>
            {step}
          </Typography>
        ) : null}
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: MAROON }}>
          {title} →
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
          {description}
        </Typography>
      </MuiLink>
    ))}
  </Box>
);
