import DocsLayout from "../../../components/Docs/DocsLayout";
import {
  Callout,
  CardGrid,
  DataTable,
  PageTitle,
  Section,
  SubSection,
} from "../../../components/Docs/elements";

const Installation = () => (
  <DocsLayout
    href="/documentation/installation"
    title="Installation"
    description="Requirements and instructions for installing the Qresp suite and the Qresp Organizer."
  >
    <PageTitle eyebrow="Installation" title="Installation">
      Instructions for installing and configuring the Qresp Organizer and the
      Qresp suite (Curator and Explorer) are detailed in this section.
    </PageTitle>

    <CardGrid
      cards={[
        {
          href: "/documentation/installation/qresp",
          title: "Qresp",
          description: "Install the Curator and Explorer with Docker Compose, and configure mail and MongoDB.",
        },
        {
          href: "/documentation/installation/qresp-organizer",
          title: "Qresp Organizer",
          description: "Install the Organizer, create a parent folder, and organize and store paper content.",
        },
      ]}
    />

    <Section title="Requirements">
      <SubSection title="Qresp">
        <DataTable
          caption="Qresp requirements"
          columns={["Software", "Version requirement"]}
          rows={[
            ["Docker CE", ">=18.06"],
            ["Docker Compose", ">=1.22 (compose file format 2.4)"],
          ]}
        />
      </SubSection>

      <SubSection title="Qresp Organizer">
        <DataTable
          caption="Qresp Organizer requirements"
          columns={["Software", "Version requirement"]}
          rows={[
            ["Python", ">=3.5"],
            ["Pip", "any"],
            ["Git", "any"],
          ]}
        />
      </SubSection>

      <Callout kind="info">
        The Qresp Organizer should be installed on a dedicated server or VM
        where your group, department, or institution intends to collect and
        store all the associated content of publishable work. Furthermore, this
        server or VM should have a http file server running so the content can
        be accessible through Qresp.
      </Callout>
    </Section>
  </DocsLayout>
);

export default Installation;
