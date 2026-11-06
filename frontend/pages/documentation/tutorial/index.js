import DocsLayout from "../../../components/Docs/DocsLayout";
import { CardGrid, PageTitle } from "../../../components/Docs/elements";

const Tutorial = () => (
  <DocsLayout
    href="/documentation/tutorial"
    title="Tutorial"
    description="How to use each software of the Qresp suite: data organization, curation, metadata collection and exploration."
  >
    <PageTitle eyebrow="Tutorial" title="Tutorial">
      The tutorial section demonstrates how to use each software of the Qresp
      suite.
    </PageTitle>

    <CardGrid
      cards={[
        {
          step: "Step 1",
          href: "/documentation/tutorial/data-organization",
          title: "Data Organization",
          description:
            "How the Qresp Organizer software can be utilized for organizing paper content and establishing services.",
        },
        {
          step: "Step 2",
          href: "/documentation/tutorial/curation",
          title: "Curation",
          description:
            "How Qresp can be utilized for creating metadata associated to the paper content.",
        },
        {
          step: "Step 3",
          href: "/documentation/tutorial/metadata-collection",
          title: "Metadata Collection",
          description: "How MongoDB can be utilized for storing metadata.",
        },
        {
          step: "Step 4",
          href: "/documentation/tutorial/exploration",
          title: "Exploration",
          description: "How Qresp can be utilized for viewing paper content.",
        },
      ]}
    />
  </DocsLayout>
);

export default Tutorial;
