import { Box, Typography } from "@mui/material";

import DocsLayout from "../../components/Docs/DocsLayout";
import {
  ExternalLink,
  P,
  PageTitle,
  Section,
} from "../../components/Docs/elements";

const REPOSITORY = "https://github.com/qresp-code-development/qresp";

// A citation, set the way a journal reference reads: title, then authors and
// source, then the DOI.
const Citation = ({ title, authors, source, doi }) => (
  <Box
    sx={{
      borderLeft: "4px solid #800000",
      bgcolor: "rgba(128,0,0,0.04)",
      borderRadius: "0 8px 8px 0",
      px: 3,
      py: 2,
      mb: 3,
    }}
  >
    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.45, mb: 0.75 }}>
      {title}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      {authors}, <em>{source}</em>.
    </Typography>
    <Typography variant="body2" sx={{ mt: 0.5 }}>
      DOI:{" "}
      <ExternalLink href={`https://doi.org/${doi}`}>{doi}</ExternalLink>
    </Typography>
  </Box>
);

const Reference = () => (
  <DocsLayout
    href="/documentation/reference"
    title="Reference"
    description="How to cite Qresp, related collaborations, and how to contribute."
  >
    <PageTitle eyebrow="Reference" title="Reference" />

    <Section title="Citing Qresp">
      <P>In publications arising from the use of Qresp, please cite:</P>
      <Citation
        title="Qresp, a tool for curating, discovering and exploring reproducible scientific papers"
        authors="M. Govoni, M. Munakami, A. Tanikanti, J. H. Skone, H. B. Runesha, F. Giberti, J. de Pablo, and G. Galli"
        source="Sci. Data 6, 190002 (2019)"
        doi="10.1038/sdata.2019.2"
      />
    </Section>

    <Section title="Collaborations">
      <Citation
        title="MatD3: A Database and Online Presentation Package for Research Data Supporting Materials Discovery, Design, and Dissemination"
        authors="R. Laasner, X. Du, A. Tanikanti, C. Clayton, M. Govoni, G. Galli, M. Ropo, and V. Blum"
        source="J. Open Source Softw. 5(45), 1945 (2020)"
        doi="10.21105/joss.01945"
      />
    </Section>

    <Section title="Contribution">
      <P>
        Want to see something added or changed? Get involved with us and make
        it happen!
      </P>
      <P>
        If you find something unclear (or confusing) in the documentation, or
        you encounter a bug, please{" "}
        <ExternalLink href={`${REPOSITORY}/issues`}>open an issue</ExternalLink>{" "}
        on GitHub. If you would like to see a new feature, add a
        feature-request tag to the issue.
      </P>
      <P>
        We also encourage users to help us in the development of Qresp: the
        code is open source and{" "}
        <ExternalLink href={REPOSITORY}>hosted on GitHub</ExternalLink>.
      </P>
    </Section>
  </DocsLayout>
);

export default Reference;
