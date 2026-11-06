import DocsLayout from "../../components/Docs/DocsLayout";
import {
  CardGrid,
  DocLink,
  ExternalLink,
  Figure,
  P,
  PageTitle,
  Section,
} from "../../components/Docs/elements";

const STEPS = [
  {
    step: "Step 1",
    href: "/documentation/tutorial/data-organization",
    title: "Paper Organization",
    description:
      "The user organizes data presented in a scientific paper as a collection of datasets, charts, scripts, tools and notebooks.",
  },
  {
    step: "Step 2",
    href: "/documentation/tutorial/curation",
    title: "Metadata Generation",
    description:
      "Qresp guides the user in creating metadata from the data associated to a scientific paper.",
  },
  {
    step: "Step 3",
    href: "/documentation/tutorial/metadata-collection",
    title: "Metadata Collection",
    description:
      "The document-oriented database collects the generated metadata. The database is maintained by the user or the user’s institution.",
  },
  {
    step: "Step 4",
    href: "/documentation/tutorial/exploration",
    title: "Paper Exploration",
    description:
      "The user explores scientific papers using the GUI of Qresp, on a per publication basis.",
  },
];

const About = () => (
  <DocsLayout
    href="/documentation/about"
    title="About"
    description="About Qresp, Curation and Exploration of Reproducible Scientific Papers, and its four steps."
  >
    <PageTitle eyebrow="Getting started" title="About Qresp">
      The open source software{" "}
      <DocLink href="/documentation/download">Qresp</DocLink> &ldquo;Curation
      and Exploration of Reproducible Scientific Papers&rdquo; facilitates the
      organization, annotation and exploration of data presented in scientific
      papers.
    </PageTitle>

    <Figure
      src="/images/docs/qresp-four-steps.png"
      alt="The four steps of Qresp: paper organization, metadata generation, metadata collection and paper exploration."
      caption="Paper organization → metadata generation → metadata collection → paper exploration."
    />

    <P>
      Qresp may be used to both curate and explore data presented in
      scientific papers or just explore curated scientific papers. Curation and
      exploration are implemented in 4 steps:
    </P>

    <CardGrid cards={STEPS} />

    <Section title="1. Paper Organization">
      <P>
        The user organizes data presented in a scientific paper as a collection
        of datasets, charts, scripts, tools and notebooks. See{" "}
        <DocLink href="/documentation/tutorial/data-organization">Data Organization</DocLink>.
      </P>
    </Section>

    <Section title="2. Metadata Generation">
      <P>
        Qresp guides the user in creating metadata from the data associated to
        a scientific paper (
        <DocLink href="/documentation/tutorial/data-organization">step 1</DocLink>
        ). The metadata gathered during this curation step includes data
        location, publication details and user-defined attributes. The metadata
        is generated using the JSON (JavaScript Object Notation) syntax and the
        metadata file is sent to a document-oriented database. The current
        implementation uses{" "}
        <ExternalLink href="https://www.mongodb.com/docs/manual/administration/install-on-linux/">
          MongoDB
        </ExternalLink>
        , which is an open source software. See{" "}
        <DocLink href="/documentation/tutorial/curation">Metadata Generation (Curation)</DocLink>.
      </P>
    </Section>

    <Section title="3. Metadata Collection">
      <P>
        The document-oriented database collects the generated metadata. The
        database is maintained by the user or the user&rsquo;s institution. See{" "}
        <DocLink href="/documentation/tutorial/metadata-collection">Metadata Collection</DocLink>.
      </P>
    </Section>

    <Section title="4. Paper Exploration">
      <P>
        The user explores scientific papers using the GUI of Qresp and may
        search curated papers, view charts, notebooks, workflows on a per
        publication basis and download the data organized in (
        <DocLink href="/documentation/tutorial/data-organization">step 1</DocLink>
        ). See{" "}
        <DocLink href="/documentation/tutorial/exploration">Paper Exploration</DocLink>.
      </P>
    </Section>
  </DocsLayout>
);

export default About;
