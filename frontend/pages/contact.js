import { Fragment } from "react";

import { Box, Container, Divider, Link as MuiLink, Typography } from "@mui/material";

import SEO from "../components/seo";

// Contact, as a page rather than a `mailto:` in the navigation bar.
//
// The header's Contact entry used to be
// `mailto:datadev@lists.uchicago.edu?subject=Qresp`. Clicking a navigation
// link and having the browser hand the page to a mail client is a jarring
// thing to do to somebody who only wanted to know how to get in touch — and
// on a machine with no mail client configured it does nothing at all, so the
// link looked broken. It also offered exactly one way to reach the project,
// when most of what people want to say ("this is broken", "here is a fix")
// belongs in the issue tracker.
//
// So: a page that shows the address as TEXT (copyable, and visible before you
// commit to anything), keeps the mail client one click away for those who
// want it, and names the two GitHub routes that are usually the right ones.

const EMAIL = "datadev@lists.uchicago.edu";
// The list is a shared inbox that receives more than Qresp. A pre-filled
// subject is what lets whoever reads it sort this mail without opening it,
// and costs the sender nothing -- it is still editable in their mail client.
const MAILTO = `mailto:${EMAIL}?subject=Qresp`;
const REPOSITORY = "https://github.com/qresp-code-development/qresp";
const ISSUES = `${REPOSITORY}/issues`;
const PULL_REQUESTS = `${REPOSITORY}/pulls`;

const contactDescription =
  "How to reach the Qresp team: email the DataDev list, report a bug, or open a pull request.";

// Every outbound link goes through here, so `rel="noopener noreferrer"` and
// the "(opens in a new tab)" note cannot be forgotten on one of them.
// `noopener` denies the opened page a handle on this one; `noreferrer` keeps
// the referring URL — which on a detail page names a record — out of the
// request.
const ExternalLink = ({ href, children }) => (
  <MuiLink
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    underline="hover"
  >
    {children}
    <Box
      component="span"
      sx={{
        position: "absolute",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        clipPath: "inset(50%)",
        whiteSpace: "nowrap",
      }}
    >
      {" (opens in a new tab)"}
    </Box>
  </MuiLink>
);

const EnvelopeIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <polyline points="2,4 12,13 22,4" />
  </svg>
);

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="white"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 0.297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const CardHeader = ({ icon, title }) => (
  <Box
    sx={{
      backgroundColor: "#800000",
      px: 3,
      py: 2,
      display: "flex",
      alignItems: "center",
      gap: 1.5,
    }}
  >
    {icon}
    <Typography variant="h6" component="h2" sx={{ color: "white", fontWeight: 700 }}>
      {title}
    </Typography>
  </Box>
);

const Contact = () => (
  <Fragment>
    <SEO title="Qresp | Contact" description={contactDescription} />

    <Container maxWidth="md">
      <Box sx={{ my: 6, display: "flex", flexDirection: "column", gap: 3 }}>

        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          Contact
        </Typography>

        {/* Intro callout */}
        <Box
          sx={{
            borderLeft: "4px solid #800000",
            pl: 3,
            py: 1.5,
            backgroundColor: "rgba(128,0,0,0.04)",
            borderRadius: "0 8px 8px 0",
          }}
        >
          <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75 }}>
            Questions about Qresp, a record you are curating, or a Qresp
            server? Write to the DataDev list. For anything about the software
            itself — a bug report or a feature request — GitHub is faster, and
            the issue stays where the people who can act on it will see it.
          </Typography>
        </Box>

        {/* Email card */}
        <Box sx={{ border: "2px solid #800000", borderRadius: 2, overflow: "hidden" }}>
          <CardHeader icon={<EnvelopeIcon />} title="Email" />
          <Box sx={{ px: 3, py: 2.5 }}>
            <MuiLink
              href={MAILTO}
              underline="hover"
              data-testid="email-datadev"
              sx={{ color: "#800000", fontWeight: 600, fontSize: "1rem" }}
            >
              {EMAIL}
            </MuiLink>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.65 }}>
              The address opens your mail client with a pre-filled subject line.
              You can also copy the address and paste it into whatever you use.
            </Typography>
          </Box>
        </Box>

        {/* GitHub card */}
        <Box sx={{ border: "2px solid #800000", borderRadius: 2, overflow: "hidden" }}>
          <CardHeader icon={<GitHubIcon />} title="GitHub" />
          <Box sx={{ px: 3, py: 2.5, display: "flex", flexDirection: "column", gap: 2.5 }}>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#800000", mb: 0.5 }}>
                Source code
              </Typography>
              <ExternalLink href={REPOSITORY}>Qresp on GitHub</ExternalLink>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {REPOSITORY}
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#800000", mb: 0.5 }}>
                Report a bug or request a feature
              </Typography>
              <ExternalLink href={ISSUES}>
                Open an issue in the Qresp issue tracker
              </ExternalLink>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.65 }}>
                Please include what you did, what you expected, and what
                happened instead. A record id or a Qresp server URL helps.
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#800000", mb: 0.5 }}>
                Contribute a change
              </Typography>
              <ExternalLink href={PULL_REQUESTS}>
                Open a pull request against the Qresp repository
              </ExternalLink>
            </Box>

          </Box>
        </Box>

      </Box>
    </Container>
  </Fragment>
);

export { EMAIL, MAILTO, REPOSITORY, ISSUES, PULL_REQUESTS };
export default Contact;
