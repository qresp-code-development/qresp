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
} from "../../../components/Docs/elements";

const REPOSITORY = "https://github.com/qresp-code-development/qresp";

const ENV_PROD = `
QRESP_PUBLIC_URL=https://your.host
QRESP_FLASK_SECRET_KEY=long-random-string
QRESP_GOOGLE_CLIENT_ID=...
QRESP_GOOGLE_CLIENT_SECRET=...
QRESP_GOOGLE_REDIRECT_URI=https://your.host/api/auth/google/callback
QRESP_FROM_ADDR=x@y.com
QRESP_MAIL_PWD=password-for-the-from-address
QRESP_SMTP_SERVER=smtp.gmail.com
QRESP_SMTP_PORT=587
QRESP_ADMIN_EMAILS=admin@y.com
`;

const QrespInstallation = () => (
  <DocsLayout
    href="/documentation/installation/qresp"
    title="Qresp Installation"
    description="Install the Qresp Curator and Explorer using Docker Compose, and configure mail and MongoDB."
  >
    <PageTitle eyebrow="Installation" title="Qresp Installation">
      Qresp is a software with a GUI which guides the user in creating metadata
      from the data associated to a scientific paper (
      <DocLink href="/documentation/tutorial/data-organization">step 1</DocLink>
      ). It can then be used to search curated papers, view charts, notebooks,
      workflows on a per publication basis and download the data associated to
      a scientific paper.
    </PageTitle>

    <P>
      The metadata gathered during this curation step includes data location,
      publication details and user-defined attributes. The metadata is
      generated using the JSON (JavaScript Object Notation) syntax and the
      metadata file is sent to a document-oriented database. The current
      implementation uses{" "}
      <ExternalLink href="https://www.mongodb.com/docs/manual/administration/install-on-linux/">
        MongoDB
      </ExternalLink>
      , which is an open source software.
    </P>

    <Section title="Installation using Docker">
      <P>
        Clone the Qresp source from the{" "}
        <ExternalLink href={REPOSITORY}>Qresp GitHub repository</ExternalLink>{" "}
        and use{" "}
        <ExternalLink href="https://docs.docker.com/compose/">Docker Compose</ExternalLink>.
        The production compose file runs MongoDB 4.4, the backend, the
        frontend and nginx:
      </P>
      <CodeBlock label="shell">{`
git clone https://github.com/qresp-code-development/qresp.git
cd qresp
git checkout master
cp .env.prod.example .env.prod      # then fill it in (see below)
docker-compose up -d --build
`}</CodeBlock>
    </Section>

    <Section title="Configuration">
      <P>
        Settings are environment variables in <Code>.env.prod</Code>, which
        is never committed. Every variable is listed, with comments, in{" "}
        <ExternalLink href={`${REPOSITORY}/blob/master/.env.prod.example`}>
          <Code>.env.prod.example</Code>
        </ExternalLink>
        ; the main ones are below (with examples). Any value in{" "}
        <Code>backend/project/config.ini</Code> can be overridden the same way
        by a <Code>QRESP_</Code>-prefixed variable.
      </P>
      <CodeBlock label=".env.prod">{ENV_PROD}</CodeBlock>
      <Bullets
        dense
        items={[
          <span key="o">
            The OAuth redirect URI must also be registered with the provider
            (Google, and optionally Microsoft or GitHub).
          </span>,
          <span key="m">
            The database settings (<Code>QRESP_MONGODB_HOST</Code>,{" "}
            <Code>QRESP_MONGODB_PORT</Code>, <Code>QRESP_MONGODB_DB_NAME</Code>)
            already point at the bundled MongoDB. To use an external MongoDB
            (4.0 or newer) instead, set them together with{" "}
            <Code>QRESP_MONGODB_USERNAME</Code> and{" "}
            <Code>QRESP_MONGODB_PASSWORD</Code>.
          </span>,
        ]}
      />

      <Callout kind="warning">
        nginx needs a TLS certificate and key at <Code>nginx/nginx.crt</Code>{" "}
        and <Code>nginx/nginx.key</Code> before the build. Use your
        site&rsquo;s certificate, or create a self-signed pair for testing
        with <Code>sh nginx/generate-local-certs.sh</Code>.
      </Callout>
    </Section>

    <Section title="Accessing the portal">
      <P>
        Once the containers are up, open <Code>https://localhost</Code> (or
        your server&rsquo;s host name) in a browser. Plain HTTP on port 80
        redirects to HTTPS.
      </P>
    </Section>
  </DocsLayout>
);

export default QrespInstallation;
