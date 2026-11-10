import { Fragment, useContext } from "react";
import { LinearProgress, Box } from "@mui/material";
import { styled } from "@mui/material/styles";

import LoadingContext from "../Context/Loading/loadingContext";

const LinearLoader = styled(LinearProgress)({
  backgroundColor: "#415161",
  "& .MuiLinearProgress-bar": {
    backgroundColor: "#1a252f",
  },
});

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
