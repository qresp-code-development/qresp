import { Box, Chip, Typography } from "@mui/material";

import DocsLayout from "../../../components/Docs/DocsLayout";
import { WORK_TYPE_ICONS } from "../../../components/CuratorElements/WorkTypeChooser";
import { WORK_TYPES, WORK_TYPE_KEYS } from "../../../Utils/workTypes";
import {
  Bullets,
  Callout,
  DocLink,
  ExternalLink,
  Fields,
  P,
  PageTitle,
  Section,
  SubSection,
} from "../../../components/Docs/elements";

const CONTENTS = [
  "Start",
  "What You Are Curating",
  "Curator Information",
  "Access Paper Content",
  "Paper Information",
  "Reference",
  "Charts",
  "Tools",
  "Datasets",
  "Scripts",
  "Documentation",
  "Workflow",
  "License",
  "Publish Metadata",
  "Preview",
  "Download",
  "Finish",
];

const anchor = (title) =>
  `#${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

const Curation = () => (
  <DocsLayout
    href="/documentation/tutorial/curation"
    title="Metadata Generation (Curation)"
    description="A section-by-section guide to curating a paper with the Qresp Curator, from start to publication."
  >
    <PageTitle eyebrow="Tutorial · Step 2" title="Metadata Generation (Curation)">
      A section-by-section guide to the{" "}
      <DocLink href="/curator">Curator</DocLink>: how Qresp gathers the
      metadata of a paper — where its content lives, what it contains and how
      it was produced — and publishes it.
    </PageTitle>

    <Box
      component="nav"
      aria-label="On this page"
      sx={{ border: 1, borderColor: "divider", borderRadius: 2, px: 2.5, py: 2, mb: 5 }}
    >
      <Typography variant="overline" component="p" sx={{ fontWeight: 700, color: "text.secondary", mb: 1 }}>
        On this page
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {CONTENTS.map((title) => (
          <Chip
            key={title}
            label={title}
            component="a"
            href={anchor(title)}
            clickable
            size="small"
            variant="outlined"
            sx={{ "&:hover": { borderColor: "primary.main", color: "primary.main" } }}
          />
        ))}
      </Box>
    </Box>

    <Section title="Start">
      <P>
        At the curator home page the user can either start from scratch for a
        new paper or resume a previously interrupted curation process, by
        uploading the JSON metadata file.
      </P>
      <Callout kind="warning">
        The start from scratch feature completely wipes the data unrecoverably;
        use with caution.
      </Callout>
      <Callout kind="tip">Use the pencil icon to edit details after saving any section.</Callout>
      <Callout kind="tip">Use the file icon to fill fields with details about files and folders.</Callout>
    </Section>

    <Section title="What You Are Curating">
      <P>
        A new record first asks what is being curated. Qresp is not only for
        published papers: any piece of research can be linked to the data,
        code and workflow behind it. The choice decides which reference fields
        the Curator asks for; it can be changed at any time from the record
        header without losing anything already entered.
      </P>
      <Fields
        items={WORK_TYPE_KEYS.map((key) => {
          const Icon = WORK_TYPE_ICONS[key];
          return [
            <Box
              key={key}
              component="span"
              sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
            >
              <Icon fontSize="small" color="primary" aria-hidden="true" />
              {WORK_TYPES[key].label}
            </Box>,
            WORK_TYPES[key].description,
          ];
        })}
      />
      <Callout kind="info">
        Nothing is required to publish, for any type. You can publish a record
        that is just its data or code and fill in the title, authors,
        description, figures and the rest later by editing it. Everything you
        add makes the record easier to find and to reproduce.
      </Callout>
      <P>
        The guided setup fills in what it can for each type. A published
        paper is looked up from its DOI or arXiv link, a report from its DOI
        or arXiv link if it has one, and a dataset from its data DOI (Zenodo,
        Figshare, Dryad and other data repositories issue them). For a code
        repository, paste its GitHub or GitLab link: Qresp reads its name,
        description, developers, latest release year and topics from the
        public page. Every value can be reviewed and edited before publishing.
        The header&rsquo;s Curator menu and the home page open the Curator
        directly on any of these types.
      </P>
    </Section>

    <Section title="Curator Information">
      <P>
        This section defines the identity of the person that is using the Qresp
        Curator to generate metadata.
      </P>
    </Section>

    <Section title="Access Paper Content">
      <P>
        This section defines the location of the remote server where the paper
        content is organized and stored. The paper content to be curated will
        be accessed by web scraping the host where the content resides.
      </P>
      <Fields
        items={[
          [
            "HTTP Connection",
            "Select the server with the http URL from the drop-down menu (e.g. https://notebook.rcc.uchicago.edu/files).",
          ],
          [
            "Zenodo",
            "Provide the Zenodo record URL to fetch data from Zenodo (e.g. https://www.zenodo.org/record/1234567).",
          ],
          [
            "File Server Path",
            "Enter the path to where the paper content is located. If you do not know the full path, the data tree helps you locate the paper content, and by clicking on a folder, the path field is automatically updated.",
          ],
        ]}
      />
      <P>
        On selection, clicking on search allows the user to navigate the server
        data tree and to select the folder with the paper content.
      </P>
    </Section>

    <Section title="Paper Information">
      <P>This section collects general information about your paper.</P>
      <Fields
        items={[
          ["PIs", "First Name, Middle Name and Last Name of all co-PIs of the paper. Use plus to add additional PIs."],
          ["Paper Stack", "Enter name(s) defining a group of papers (e.g. according to source of funding)."],
          [
            "Keywords",
            "Enter keyword(s) (e.g. 'DFT', 'organic materials', 'charge transfer'): they facilitate paper searches using Qresp Exploration.",
          ],
          [
            "Main Notebook File",
            "Enter the name of a notebook file. This file may serve as a table of contents and may contain links to all datasets, charts, scripts, tools and documentation. Use the file picker (just right of the label, Main Notebook File) to fill this field.",
          ],
        ]}
      />
    </Section>

    <Section title="Reference">
      <P>
        This section collects information about the publication associated to
        the paper. The DOI number may aid in auto-filling certain fields.
      </P>
      <Fields
        items={[
          ["Kind", "Choose type of publication: Preprint, Journal, Dissertation."],
          ["DOI", "Enter the Digital Object Identifier of the publication."],
          ["Title", "Enter title."],
          ["JournalFull", "Enter name (in full) of journal."],
          ["JournalAbbr", "Enter name (abbreviated) of journal."],
          ["Volume", "Enter volume number."],
          ["Page", "Enter page number."],
          ["Year", "Enter year."],
          ["Abstract", "Enter abstract."],
          ["URLs", "Enter link(s) of the paper."],
        ]}
      />
    </Section>

    <Section title="Charts">
      <P>This section collects information about the charts of the paper.</P>
      <Fields
        items={[
          ["Kind", "Select Figure or Table."],
          ["Caption", "Enter chart caption."],
          ["Number", "Enter chart number."],
          [
            "Files",
            "Enter file name(s) containing the data displayed in the chart (e.g. a file in CSV format). Use the Paper Content widget to fill this field.",
          ],
          [
            "Image File",
            "Enter the file name containing a snapshot of the chart. Use the Paper Content widget to fill this field. Allowed formats are: jpg, jpeg, gif, png.",
          ],
          [
            "Notebook File",
            "Enter the name of the notebook file used to generate the chart. Use the Paper Content widget to fill this field. Allowed format is ipynb.",
          ],
          [
            "Keywords",
            "Enter keyword(s) for the content displayed in the chart (e.g. 'potential energy surface', 'band gap').",
          ],
        ]}
      />
    </Section>

    <Section title="Tools">
      <P>
        This section collects information about the tools used in the paper. A
        tool represents the use of an instrument (either software or
        experimental set up).
      </P>
      <SubSection title="If Software">
        <Fields
          items={[
            ["Kind", "Select Software or Experiment."],
            ["Package Name", "Enter name of the package (e.g. 'WEST')."],
            ["URLs", "Enter link(s) to the package official website (e.g. 'www.west-code.org')."],
            ["Version", "Enter version number of the package (e.g. '3.0.0')."],
            ["Executable Name", "Enter name of the package executable (e.g. 'wstat.x')."],
            [
              "Patches",
              "Enter file name(s) containing the patches of publicly available or versioned software, customized by the user to generate some of the datasets. Use the Paper Content widget to fill this field (e.g. 'Tools/modified_wstat.txt').",
            ],
            [
              "Description",
              "Enter a summary of the modifications, if any, made to the executable(s) using the patches.",
            ],
          ]}
        />
      </SubSection>
      <SubSection title="If Experiment">
        <Fields
          items={[
            [
              "Facility name",
              "Enter the name of the facility where the experiment was conducted (e.g. 'Argonne Advanced Photon Source').",
            ],
            ["Measurement", "Enter the type of measurement (e.g. 'soft X-ray Photoemission')."],
            ["URLs", "Enter link(s) to the facility website (e.g. 'https://www.aps.anl.gov')."],
          ]}
        />
      </SubSection>
    </Section>

    <Section title="Datasets">
      <P>
        This section collects information about the datasets generated in the
        paper. A dataset is a file or folder or a combination of the two which
        contains raw data generated in the scientific paper. Datasets are
        created by an instrument or by a versioned software.
      </P>
      <Fields
        items={[
          [
            "Files",
            "Enter file name(s) to identify the dataset. Use the Paper Content widget to fill this field (e.g. 'Data/dataset.dat'). If you list a folder name, all documents of the folder belong to the dataset.",
          ],
          ["Description", "Enter a summary about the content of the dataset."],
          ["URLs", "Enter link(s) to the URL of the dataset, if available."],
        ]}
      />
    </Section>

    <Section title="Scripts">
      <P>
        This section collects information about the scripts. Scripts are source
        codes not available publicly that are used to manipulate datasets and
        generate the data files of charts, or other data discussed in the
        scientific paper.
      </P>
      <Fields
        items={[
          [
            "Files",
            "Enter file names to identify the script. Use the Paper Content widget to fill this field (e.g. 'Script/scriptA.py'). If you list a folder name, all documents of the folder belong to the script.",
          ],
          ["Description", "Enter a summary about the content of the script."],
          ["URLs", "Enter link(s) to the URL of the script, if available."],
        ]}
      />
    </Section>

    <Section title="Documentation">
      <P>This section collects additional information needed to reproduce the paper.</P>
    </Section>

    <Section title="Workflow">
      <P>
        This section defines the workflow of the paper. A workflow represents
        how the content of the paper was created.
      </P>
      <Bullets
        items={[
          "Use the Edit button in the canvas to add an external node, or to add a node connection. The types of nodes are listed alongside the canvas (hover over a node for hints).",
          "Use the Rearrange button to animate the workflow.",
        ]}
      />
      <Fields
        items={[
          [
            "External",
            "Content that was used within the paper, but not generated within the paper. A reference or link is not required but recommended.",
          ],
          ["Chart", "A figure or a table, typically considered an end-point within the workflow."],
          ["Tool", "An instrument (either software or experimental set up) utilized in the paper."],
          ["Dataset", "Data generated by either a Tool or Script node."],
          [
            "Script",
            "User-defined procedures utilized in the paper (e.g. to analyze or post-process data belonging to datasets).",
          ],
        ]}
      />
    </Section>

    <Section title="License">
      <P>
        The License section allows the user to choose a{" "}
        <ExternalLink href="https://creativecommons.org/licenses/">Creative Commons License</ExternalLink>{" "}
        under which the data will be published on Qresp.
      </P>
    </Section>

    <Section title="Publish Metadata">
      <P>
        Publishing needs you to be signed in. When you click the publish
        button, the data will be validated. If there are no errors, the record
        is published at once and you will see a confirmation with a link to
        it. Otherwise, you&rsquo;ll see a message indicating what the error
        is.
      </P>
    </Section>

    <Section title="Preview">
      <P>
        Click on the Preview button to preview the entire curated paper. This
        can be shared as a private URL with others.
      </P>
    </Section>

    <Section title="Download">
      <P>
        The Download button downloads the curated metadata in JSON format. This
        helps in safekeeping your data and resuming the curation process at a
        later stage.
      </P>
    </Section>

    <Section title="Finish">
      <P>
        Once published, your record is available using the{" "}
        <DocLink href="/explorer">Explorer</DocLink>. If there were any errors,
        you&rsquo;ll be notified and can take them up with the admins or with
        us, the <DocLink href="/contact">Qresp team</DocLink>. We&rsquo;re
        always happy to help.
      </P>
    </Section>
  </DocsLayout>
);

export default Curation;
