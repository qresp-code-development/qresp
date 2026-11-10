import { Html, Head, Main, NextScript } from "next/document";
// Official MUI pages-router SSR adapter (emotion style extraction); replaces
// the JSS ServerStyleSheets pattern from @material-ui v4. The viewport meta
// moved out: Next injects the equivalent default in the pages router.
import {
  DocumentHeadTags,
  documentGetInitialProps,
} from "@mui/material-nextjs/v16-pagesRouter";

export default function MyDocument(props) {
  return (
    <Html lang="en">
      <Head>
        <DocumentHeadTags {...props} />
        <meta name="theme-color" content="#800000" />
        <link rel="icon" type="image/x-icon" href="/images/favicon.ico" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@200&display=swap"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

MyDocument.getInitialProps = documentGetInitialProps;
