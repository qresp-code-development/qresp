import DocsLayout from "../../components/Docs/DocsLayout";
import {
  DataTable,
  DocLink,
  ExternalLink,
  Fields,
  P,
  PageTitle,
  Section,
} from "../../components/Docs/elements";

// Public Qresp nodes, as listed by the Qresp project.
const NODES = [
  ["The University of Chicago", "v3.0.0", "https://paperstack.uchicago.edu"],
  ["Duke University", "v1.2.0", "https://qresp.hybrid3.duke.edu/"],
];

const CurationAndExploration = () => (
  <DocsLayout
    href="/documentation/curation-and-exploration"
    title="Curation & Exploration"
    description="The Qresp Curator and Explorer, and the ecosystem of public Qresp nodes."
  >
    <PageTitle eyebrow="Getting started" title="Curation & Exploration">
      Qresp is a tool to facilitate scientific data reproducibility by making
      available, in a distributed manner, all data and procedures presented in
      scientific papers, together with metadata to render them searchable and
      discoverable.
    </PageTitle>

    <Section title="Two applications in one">
      <Fields
        items={[
          [
            <DocLink key="c" href="/curator">Curator</DocLink>,
            "Guides users in the creation of metadata for the data that accompanies a publishable scientific work.",
          ],
          [
            <DocLink key="e" href="/explorer">Explorer</DocLink>,
            "Provides a portal for the scientific community to access datasets, explore workflows and download curated data, published in scientific papers.",
          ],
        ]}
      />
      <P>
        Step-by-step guides for each are in the tutorial:{" "}
        <DocLink href="/documentation/tutorial/curation">Metadata Generation (Curation)</DocLink>{" "}
        and <DocLink href="/documentation/tutorial/exploration">Paper Exploration</DocLink>.
      </P>
    </Section>

    <Section title="The Qresp ecosystem">
      <P>
        Multiple public instances of Qresp form a Qresp ecosystem, where each
        node of the network can be queried using a federated search mechanism.
      </P>
      <P>List of active Qresp nodes:</P>
      <DataTable
        caption="Active Qresp nodes"
        columns={["Institution", "Version", "Location"]}
        rows={NODES.map(([institution, version, url]) => [
          institution,
          version,
          <ExternalLink key={url} href={url}>{url}</ExternalLink>,
        ])}
      />
    </Section>
  </DocsLayout>
);

export default CurationAndExploration;
