import { useContext } from "react";
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

  return <Box>{loading ? <LinearLoader /> : null}</Box>;
};

export default Loader;
