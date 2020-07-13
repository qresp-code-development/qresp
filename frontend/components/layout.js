import Header from "../components/Header/header";
import Footer from "../components/Footer/footer";
import { Box } from "@material-ui/core";
import PropTypes from "prop-types";
import AlertDialog from "./alert";

function Layout({ children }) {
  return (
    <Box display="flex" flexDirection="column" flexGrow={1}>
      <Header />
      <AlertDialog />
      <Box display="flex" flexGrow={1}>
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
