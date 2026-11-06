import Header from "../components/header";
import Footer from "../components/footer";
import { Box } from "@mui/material";
import PropTypes from "prop-types";
import AlertDialog from "./alert";
import Loader from "./loader";

// THE PAGE SHELL OWNS ITS OWN HEIGHT.
//
// It used to inherit one, through `html, body { height: 100% }` in
// global.css and a chain of `flex-grow: 1` down to here. That chain resolves
// against the initial containing block, and a horizontal scrollbar takes 15px
// out of it -- so a single element wide enough to cause one made the whole
// shell shorter than the window, and the footer stopped short of the bottom
// with the body's background showing underneath.
//
// A viewport-relative minimum cannot be shortened that way. `dvh` is the
// dynamic viewport, which is what a phone's collapsing address bar leaves;
// `vh` is the fallback for anything that does not know the unit yet.
//
// `minHeight`, not `height`: a long page still grows past it.
const shell = {
  display: "flex",
  flexDirection: "column",
  // `#__next` is a flex row, so this keeps the shell full width.
  flexGrow: 1,
  minWidth: 0,
  minHeight: "100vh",
  "@supports (min-height: 100dvh)": {
    minHeight: "100dvh",
  },
};

function Layout({ children }) {
  return (
    <Box sx={shell}>
      <Loader />
      <Header />
      <AlertDialog />
      {/* Everything between the header and the footer, taking whatever
          height is left over. Also the page's one `main` landmark, which
          nothing else was providing. */}
      <Box component="main" sx={{ display: "flex", flex: 1, minWidth: 0 }}>
        {children}
      </Box>
      <Footer />
    </Box>
  );
}

Layout.propTypes = {
  children: PropTypes.object.isRequired,
};

export default Layout;
