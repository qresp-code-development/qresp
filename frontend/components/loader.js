import { Fragment, useContext } from "react";
import { LinearProgress, withStyles, Box } from "@material-ui/core";

import LoadingContext from "../Context/Loading/loadingContext";

const LinearLoader = withStyles({
  colorPrimary: {
    backgroundColor: "#415161",
  },
  barColorPrimary: {
    backgroundColor: "#1a252f",
  },
})(LinearProgress);

const Loader = () => {
  const { loading } = useContext(LoadingContext);

  return (
    <Box
      style={{
        top: 0,
        left: 0,
        position: "fixed",
        zIndex: 10000,
        width: "100%",
      }}
    >
      {loading ? (
        <Fragment>
          <LinearProgress color="secondary" />
          <LinearLoader />
        </Fragment>
      ) : null}
    </Box>
  );
};

export default Loader;
