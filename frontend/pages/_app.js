import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
// MUI v5+ styles with emotion; the official Next.js pages-router adapter
// replaces the old JSS ServerStyleSheets/jss-server-side dance.
import { AppCacheProvider } from "@mui/material-nextjs/v16-pagesRouter";

import Theme from "../theme/theme";
import Layout from "../components/layout";
import "../styles/global.css";

// Vis Network CSS
import "vis-network/styles/vis-network.css";

// File Tree CSS Class
import "react-checkbox-tree/lib/react-checkbox-tree.css";

import AlertState from "../Context/Alert/AlertState";
import AuthState from "../Context/Auth/AuthState";
import FavoritesState from "../Context/Favorites/FavoritesState";
import LoadingState from "../Context/Loading/LoadingState";
import ServerState from "../Context/Servers/ServerState";

export default function App(props) {
  const { Component, pageProps } = props;

  return (
    <AppCacheProvider {...props}>
      <ThemeProvider theme={Theme}>
        <CssBaseline />
        <AuthState>
          <FavoritesState>
            <LoadingState>
              <AlertState>
                <ServerState>
                  <Layout>
                    <Component {...pageProps} />
                  </Layout>
                </ServerState>
              </AlertState>
            </LoadingState>
          </FavoritesState>
        </AuthState>
      </ThemeProvider>
    </AppCacheProvider>
  );
}
