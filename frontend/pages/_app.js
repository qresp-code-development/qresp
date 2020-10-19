import { useEffect } from "react";

import CssBaseline from "@material-ui/core/CssBaseline";
import { ThemeProvider } from "@material-ui/core/styles";

import Theme from "../theme/theme";
import Layout from "../components/layout";
import "../styles/global.css";

// Vis Network CSS
import "vis-network/styles/vis-network.css";

// File Tree CSS Class
import "react-checkbox-tree/lib/react-checkbox-tree.css";

import AlertState from "../Context/Alert/AlertState";
import LoadingState from "../Context/Loading/LoadingState";
import ServerState from "../Context/Servers/ServerState";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Remove the server-side injected CSS.
    const jssStyles = document.querySelector("#jss-server-side");
    if (jssStyles) {
      jssStyles.parentElement.removeChild(jssStyles);
    }
  }, []);

  return (
    <ThemeProvider theme={Theme}>
      <CssBaseline />
      <LoadingState>
        <AlertState>
          <ServerState>
            <Layout>
              <Component {...pageProps} />
            </Layout>
          </ServerState>
        </AlertState>
      </LoadingState>
    </ThemeProvider>
  );
}
