import DocsLayout from "../../../components/Docs/DocsLayout";
import {
  Bullets,
  Callout,
  Code,
  CodeBlock,
  DocLink,
  ExternalLink,
  P,
  PageTitle,
  Section,
  SubSection,
  Tree,
} from "../../../components/Docs/elements";

const ARCHIVE =
  "https://github.com/qresp-code-development/qresp-organizer/archive/v1.1.0.tar.gz";

const PARENT_FOLDER = [
  [0, "paper_collection/", "folder"],
  [1, "qresp.ini", "config"],
  [1, "paperA/", "folder"],
  [1, "paperB/", "folder"],
  [1, "paperC/", "folder"],
];

const QRESP_INI = `
[SERVICE]
ishttpservice = Y
isglobusservice = Y
isgitservice = Y

[SERVICE.PATH]
http_service_path=http://notebook.rcc.uchicago.edu/files
globus_service_path=https://www.globus.org/app/transfer?origin_id=72277ed4-1ad3-11e7-bbe1-22000b9a448b&origin_path=
`;

const DATA_ORGANIZATION = "/documentation/tutorial/data-organization";

const QrespOrganizerInstallation = () => (
  <DocsLayout
    href="/documentation/installation/qresp-organizer"
    title="Qresp Organizer Installation"
    description="Install the Qresp Organizer, create a parent folder, and organize and store paper content."
  >
    <PageTitle eyebrow="Installation" title="Qresp Organizer Installation">
      Qresp Organizer is a software to configure the parent folder containing a
      collection of folders where each paper content is organized and stored.
      An example of a parent folder (<Code>paper_collection</Code>) is shown
      below.
    </PageTitle>

    <Tree entries={PARENT_FOLDER} label="Example parent folder, paper_collection" />

    <Section title="Installing">
      <P>To install Qresp Organizer you can either:</P>
      <SubSection title="Download and install">
        <P>
          Download the{" "}
          <ExternalLink href={ARCHIVE}>Qresp Organizer</ExternalLink> file and
          run:
        </P>
        <CodeBlock>{"pip install qresp_config-1.1.0.tar.gz"}</CodeBlock>
      </SubSection>
      <SubSection title="Use PyPI">
        <CodeBlock>{"pip install qresp_config"}</CodeBlock>
      </SubSection>
      <SubSection title="Use GitHub">
        <CodeBlock>{`
git clone https://github.com/qresp-code-development/qresp-organizer.git
cd qresp-organizer
python setup.py install --user
`}</CodeBlock>
      </SubSection>
    </Section>

    <Section title="How to create a parent folder">
      <Bullets
        items={[
          "Super-user privileges may facilitate this step but are not mandatory.",
          <span key="run">
            After installation, run <Code>qresp_config</Code> to create the
            parent folder, for example <Code>paper_collection</Code>, which
            will host paper content of user(s) and generate a config file (
            <Code>qresp.ini</Code>).
          </span>,
        ]}
      />
      <CodeBlock>{"qresp_config collection <folder_name> [<path>]"}</CodeBlock>
      <P>
        The <Code>qresp_config</Code> script will ask the user to identify an
        http service path, Globus service path and Git service. These paths
        will generate the <Code>qresp.ini</Code> file. An example of the file
        content is the following:
      </P>
      <CodeBlock label="qresp.ini">{QRESP_INI}</CodeBlock>
      <Callout kind="note">
        <Code>globus_service_path</Code> is a non-mandatory field, however the{" "}
        <Code>http_service_path</Code> is needed for the Qresp Explorer to
        explore your paper contents.
      </Callout>
    </Section>

    <Section title="How to organize a paper content">
      <P>
        Qresp Organizer also facilitates in organizing your paper as discussed
        in <DocLink href={DATA_ORGANIZATION}>data organization</DocLink>.
      </P>
      <SubSection title="1. Initialize">
        <P>
          Initialize <Code>qresp_config</Code> to create a folder with the
          paper name inside the <Code>paper_collection</Code> folder. If a git
          service is running, <Code>qresp.py</Code> creates an additional{" "}
          <Code>paper_name.git</Code> folder.
        </P>
        <CodeBlock>{`
cd paper_collection                    # parent folder hosting all user(s) papers
qresp_config paper <paper_name> [<path>]  # creates empty folders with the user's paper name
`}</CodeBlock>
      </SubSection>
      <SubSection title="2. Populate">
        <P>Populate the content of the paper folder. If a git service is running:</P>
        <CodeBlock>{"git clone ssh://<username>@<servername>:<path>.git"}</CodeBlock>
        <P>otherwise:</P>
        <CodeBlock>{"scp <source> <destination>"}</CodeBlock>
      </SubSection>
      <Callout kind="tip">
        Please follow the{" "}
        <DocLink href={DATA_ORGANIZATION}>data organization</DocLink> tutorial
        to ease the curation process.
      </Callout>
    </Section>

    <Section title="How to store paper content">
      <P>
        Qresp Organizer can aid in transferring your paper content from a local
        machine to the parent folder or in uploading your content to Zenodo.
      </P>
      <Bullets
        ordered
        items={[
          <span key="login">
            Log in to <ExternalLink href="https://zenodo.org/login/">Zenodo</ExternalLink>.
          </span>,
          <span key="token">
            Generate a new token at the{" "}
            <ExternalLink href="https://zenodo.org/account/settings/applications/">
              applications page
            </ExternalLink>
            . Create a personal token with all permissions checked and copy the
            token id.
          </span>,
          "Specify the folder name and the token to upload:",
        ]}
      />
      <CodeBlock>{"qresp_config zenodo upload <folder_name> <token>"}</CodeBlock>
    </Section>
  </DocsLayout>
);

export default QrespOrganizerInstallation;
