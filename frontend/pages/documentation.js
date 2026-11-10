import NextLink from "next/link";
import { Box, Link as MuiLink, Typography } from "@mui/material";

import DocsLayout from "../components/Docs/DocsLayout";
import {
  CardGrid,
  Code,
  ExternalLink,
  P,
  PageTitle,
  Section,
} from "../components/Docs/elements";

// Qresp documentation, in the app.
//
// The reference manual published at qresp.org — about, download,
// installation, the tutorial and the reference pages — lives here as well, so
// it can be read beside the tool it describes. This index is its front page.
//
// There is exactly ONE folder layout on this site, and it is the Qresp Folder
// Standard v1 at /documentation/folder-standard. This page used to carry a
// second, general research-package template as well (project/, data/raw/,
// data/processed/, figures/) with its own copy button. Two copyable structures
// side by side asked a reader to pick, and the one they were most likely to
// pick was the one on this page — which the RCC analyzer does not read. It is
// gone rather than relabelled: a caveat under a copy button is not a match for
// the button.
//
// Legacy folder names (data, Figures_Tables, Plot_Scripts, doc) are still
// recognized by the analyzer exactly as before. Removing a suggestion from the
// documentation changes nothing about what Qresp can READ — that is the whole
// reason it was safe to remove.

const DOCUMENTATION_SITE = "https://qresp.org";
const FOLDER_STANDARD_PATH = "/documentation/folder-standard";
const EMAIL = "datadev@lists.uchicago.edu";

const SECTIONS = [
  {
    href: "/documentation/about",
    title: "About Qresp",
    description:
      "What Qresp is, and the four steps of curation and exploration: paper organization, metadata generation, metadata collection and paper exploration.",
  },
  {
    href: "/documentation/curation-and-exploration",
    title: "Curation & Exploration",
    description:
      "The Curator and the Explorer, and the ecosystem of public Qresp nodes connected by federated search.",
  },
  {
    href: "/documentation/download",
    title: "Download",
    description:
      "Qresp and Qresp Organizer releases, and every published version of the metadata JSON schema.",
  },
  {
    href: "/documentation/installation",
    title: "Installation",
    description:
      "Requirements, and how to install and configure Qresp and the Qresp Organizer.",
  },
  {
    href: "/documentation/tutorial",
    title: "Tutorial",
    description:
      "A walk through every part of the Qresp suite, from organizing paper content to exploring a curated paper.",
  },
  {
    href: "/documentation/reference",
    title: "Reference",
    description:
      "How to cite Qresp, related collaborations, and how to contribute to the project.",
  },
];

const Documentation = () => (
  <DocsLayout
    href="/documentation"
    title="Documentation"
    description="The Qresp documentation: about, download, installation, tutorials and reference, and the Qresp Folder Standard v1."
  >
    <PageTitle eyebrow="Qresp documentation" title="Documentation">
      The open source software Qresp &ldquo;Curation and Exploration of
      Reproducible Scientific Papers&rdquo; facilitates the organization,
      annotation and exploration of data presented in scientific papers.
    </PageTitle>

    <CardGrid cards={SECTIONS} />

    <Section title="Organizing a research project">
      <P>
        Qresp curates whatever structure you already have, and never renames
        anything on your file server. But there is one layout it{" "}
        <strong>reads</strong>: the Qresp Folder Standard v1. A folder that
        follows it is proposed as charts, datasets, scripts, and tools
        automatically, instead of being left for you to sort out by hand.
      </P>
      <P sx={{ mb: 3 }}>
        It is the recommended contract for accurate automatic analysis, not a
        rule about where your files may live. Existing folders — including
        ones using older names such as <Code>data</Code>,{" "}
        <Code>Figures_Tables</Code>, or <Code>Plot_Scripts</Code> — keep
        working exactly as they do today.
      </P>

      <Box
        sx={{ border: "2px solid #800000", borderRadius: 2, overflow: "hidden" }}
        data-testid="folder-standard-callout"
      >
        <Box sx={{ backgroundColor: "#800000", px: 3, py: 2 }}>
          <Typography variant="h6" component="h3" sx={{ color: "white", fontWeight: 700 }}>
            Qresp Folder Standard v1
          </Typography>
        </Box>
        <Box sx={{ px: 3, py: 2.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.7 }}>
            The full standard — the canonical folder tree, what each
            sub-folder means to the analyzer, and a copyable version of the
            structure you can drop into any project.
          </Typography>
          <MuiLink
            component={NextLink}
            href={FOLDER_STANDARD_PATH}
            underline="hover"
            data-testid="folder-standard-link"
            sx={{ color: "#800000", fontWeight: 600, fontSize: "0.95rem" }}
          >
            Read the Qresp Folder Standard v1 →
          </MuiLink>
        </Box>
      </Box>
    </Section>

    <Section title="Contact us">
      <P>
        You can{" "}
        <MuiLink href={`mailto:${EMAIL}?subject=Qresp`} underline="hover">
          email us
        </MuiLink>{" "}
        at <strong>{EMAIL}</strong> for support, or see the{" "}
        <MuiLink component={NextLink} href="/contact" underline="hover">
          Contact
        </MuiLink>{" "}
        page for the issue tracker and pull requests.
      </P>
    </Section>

    <Section title="Partners and support">
      <P>
        The Qresp software is developed at the{" "}
        <ExternalLink href="https://www.uchicago.edu/">University of Chicago</ExternalLink>{" "}
        and{" "}
        <ExternalLink href="https://www.anl.gov/">Argonne National Laboratory</ExternalLink>.
      </P>
      <P>
        The development of Qresp is supported by{" "}
        <ExternalLink href="http://miccom-center.org">MICCoM</ExternalLink>, as
        part of the Computational Materials Sciences Program funded by the U.S.
        Department of Energy, Office of Science, Office of Basic Energy
        Sciences.
      </P>
      <Typography variant="caption" color="text.secondary" display="block">
        This documentation is also published at{" "}
        <ExternalLink href={DOCUMENTATION_SITE}>qresp.org</ExternalLink>.
      </Typography>
    </Section>
  </DocsLayout>
);

export { DOCUMENTATION_SITE, FOLDER_STANDARD_PATH };
export default Documentation;
