import DocsLayout from "../../../components/Docs/DocsLayout";
import {
  DocLink,
  ExternalLink,
  P,
  PageTitle,
  Section,
} from "../../../components/Docs/elements";

const MetadataCollection = () => (
  <DocsLayout
    href="/documentation/tutorial/metadata-collection"
    title="Metadata Collection"
    description="How Qresp stores the metadata generated during curation in a document-oriented database."
  >
    <PageTitle eyebrow="Tutorial · Step 3" title="Metadata Collection">
      The document-oriented database collects the generated metadata. The
      database is maintained by the user or the user&rsquo;s institution.
    </PageTitle>

    <Section title="From curation to the database">
      <P>
        The metadata generated out of the curation step is a JSON file which
        details and tags the project. This metadata is stored in a{" "}
        <ExternalLink href="https://www.mongodb.com/docs/manual/administration/install-on-linux/">
          MongoDB
        </ExternalLink>{" "}
        database, which can then be queried by a user through the{" "}
        <DocLink href="/explorer">Qresp Explorer</DocLink> GUI, so they may view
        and further interact with a paper&rsquo;s curated content.
      </P>
    </Section>

    <Section title="Metadata schema">
      <P>
        The schema for the metadata is detailed using{" "}
        <ExternalLink href="https://json-schema.org/">JSON Schema</ExternalLink>,
        and every published version is available on the{" "}
        <DocLink href="/documentation/download#metadata-schema">Download</DocLink>{" "}
        page.
      </P>
    </Section>
  </DocsLayout>
);

export default MetadataCollection;
