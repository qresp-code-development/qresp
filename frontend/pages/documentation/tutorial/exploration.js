import { Box } from "@mui/material";

import DocsLayout from "../../../components/Docs/DocsLayout";
import { CHART_ACTIONS } from "../../../components/Paper/ChartActions";
import {
  Bullets,
  DocLink,
  Fields,
  P,
  PageTitle,
  Section,
} from "../../../components/Docs/elements";

const Exploration = () => (
  <DocsLayout
    href="/documentation/tutorial/exploration"
    title="Paper Exploration"
    description="How to search Qresp servers and explore the charts, datasets, scripts, tools and workflows of a curated paper."
  >
    <PageTitle eyebrow="Tutorial · Step 4" title="Paper Exploration">
      The <DocLink href="/explorer">Qresp Explorer</DocLink> is a GUI to explore
      and make available data on a per-publication basis. It provides a portal
      for the scientific community to access datasets, tools and workflows of a
      published scientific paper, enabling the reproducibility and validation
      of the paper results.
    </PageTitle>

    <Section title="Access a Qresp server instance">
      <P>
        This step allows the user to choose one or all Qresp instances to
        explore the curated papers. See the{" "}
        <DocLink href="/documentation/curation-and-exploration#the-qresp-ecosystem">
          Qresp ecosystem
        </DocLink>{" "}
        for the list of active nodes.
      </P>
    </Section>

    <Section title="Search and filtered search">
      <P>
        This step allows the user to filter their search results by entering
        any of the following:
      </P>
      <Bullets
        items={[
          "General keyword search",
          "Collection names",
          "DOI of the paper",
          "Tags of the paper",
          "Title of the paper",
          "Authors of the paper",
          "Publication source",
        ]}
      />
      <P>
        Alternatively, the user can click the search button to view all papers
        without applying any filter.
      </P>
      <P>
        The buttons above the results show one kind of record at a time:
        published papers, unpublished papers and reports, code repositories,
        datasets or other works. Each shows how many records it holds;{" "}
        <strong>All</strong> (the default) shows every kind. The choice also
        applies to the results of an advanced search.
      </P>
    </Section>

    <Section title="View paper information">
      <P>
        This step allows the user to view and download the files that generated
        each figure or table, and the paper&rsquo;s datasets, scripts, tools and
        workflow.
      </P>
      <P>
        Under every figure or table there is a row of labelled buttons. Hover
        over any of them to see what it does; a button only appears when the
        curator provided what it links to.
      </P>
      <Fields
        items={["files", "workflow", "download", "notebook"].map((key) => {
          const { label, Icon, description } = CHART_ACTIONS[key];
          return [
            <Box
              key={key}
              component="span"
              sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
            >
              <Icon fontSize="small" color="primary" aria-hidden="true" />
              {label}
            </Box>,
            description,
          ];
        })}
      />
    </Section>
  </DocsLayout>
);

export default Exploration;
