import { Box, Typography } from "@mui/material";

import DocsLayout from "../../../components/Docs/DocsLayout";
import {
  Bullets,
  Callout,
  Code,
  DocLink,
  ExternalLink,
  Fields,
  P,
  PageTitle,
  Section,
} from "../../../components/Docs/elements";

// The folder ROLES from the Qresp data-organization tutorial. The tree to lay
// a new folder out by is not redrawn here: there is one published layout on
// this site, the Qresp Folder Standard v1, and this page links to it.
const ROLES = [
  [
    <Code key="d">datasets</Code>,
    "Raw data generated in the scientific paper, i.e. datasets created by an instrument or by a versioned software.",
  ],
  [
    <Code key="c">charts</Code>,
    "The images (e.g. figureA.png) of figures and tables and the notebooks (e.g. figureA.ipynb) used to create them. Data files (e.g. figureA.csv) contain exclusively the data displayed in the figures and tables.",
  ],
  [
    <Code key="s">scripts</Code>,
    "Source codes (e.g. fileA.py, fileB.py) not available publicly, used to manipulate datasets and generate the data files of charts, or other data discussed in the scientific paper.",
  ],
  [
    <Code key="t">tools</Code>,
    "Patches of publicly available or versioned software, customized by the user to generate some of the datasets.",
  ],
  [
    <Code key="o">docs</Code>,
    "Documentation that the user may want to provide in addition to that reported in notebooks and in the scientific paper, for example tutorials.",
  ],
  [
    "Main notebook",
    "A notebook file (toc.ipynb, or main.ipynb in the Folder Standard) that serves as a table of contents and may contain links to all datasets, charts, scripts, tools and docs.",
  ],
];

const DataOrganization = () => (
  <DocsLayout
    href="/documentation/tutorial/data-organization"
    title="Data Organization"
    description="How to organize the data of a scientific paper for curation with Qresp, and where to host it."
  >
    <PageTitle eyebrow="Tutorial · Step 1" title="Data Organization">
      To aid in the curation of scientific papers we suggest the following data
      organization. However, Qresp does not require a specific organization and
      you may choose your own.
    </PageTitle>

    <Section title="Suggested data organization">
      <P>
        These folders should comprise all data and scripts you have used in
        your project.
      </P>
      <Fields items={ROLES} />

      <Box
        sx={{
          border: "2px solid #800000",
          borderRadius: 2,
          px: 3,
          py: 2.5,
          mb: 3,
        }}
      >
        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, color: "#800000", mb: 0.75 }}>
          Lay the folder out with the Qresp Folder Standard v1
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 1.5 }}>
          The same five role folders, as the exact tree this server&rsquo;s
          folder analysis reads — with one sub-folder per chart, dataset,
          script or tool — so a folder that follows it is proposed as records
          automatically when you curate it.
        </Typography>
        <DocLink href="/documentation/folder-standard" sx={{ color: "#800000", fontWeight: 600 }}>
          Read the Qresp Folder Standard v1 →
        </DocLink>
      </Box>
    </Section>

    <Section title="Data location and access">
      <P>
        The organized data should be located on a server that is accessible to
        the public by running a http service, e.g.{" "}
        <ExternalLink href="https://httpd.apache.org/">Apache</ExternalLink>.
        This is required to use the exploration feature of Qresp. Optionally,
        use:
      </P>
      <Bullets
        items={[
          <span key="g">
            <ExternalLink href="https://www.globus.org/data-sharing">Globus</ExternalLink>{" "}
            to make the data shareable and downloadable via GridFTP
            (recommended for large datasets).
          </span>,
          <span key="v">
            <ExternalLink href="https://git-scm.com/book/en/v2/Getting-Started-About-Version-Control">
              Git
            </ExternalLink>{" "}
            to version control the data.
          </span>,
        ]}
      />
      <Callout kind="important">
        Make sure the file permissions are set to read for anyone, otherwise
        the data won&rsquo;t be accessible over the internet. An easy way to do
        this (on Linux) for all the files and folders is to run{" "}
        <Code>chmod -R a+r *</Code> inside your data folder.
      </Callout>
      <P>
        The <DocLink href="/documentation/installation/qresp-organizer">Qresp Organizer</DocLink>{" "}
        can create the parent folder and paper folders, and record the http,
        Globus and Git services that serve them.
      </P>
    </Section>
  </DocsLayout>
);

export default DataOrganization;
