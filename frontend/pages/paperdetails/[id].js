import { Fragment, useContext, useEffect } from "react";
import { useRouter } from "next/router";
import {
  Container,
  Box,
  Typography,
  Divider,
  Chip,
  withStyles,
} from "@material-ui/core";

import SEO from "../../components/seo";
import apiEndpoint from "../../Context/axios";
import AlertContext from "../../Context/Alert/alertContext";
import { SmallStyledButton } from "../../components/button";

const StyledChip = withStyles({
  root: {
    margin: "4px",
    color: "rgba(0,0,0,0.60)",
    clipPath: "polygon(0% 0%, 75% 0%, 85% 50%, 75% 100%, 0% 100%)",
    borderRadius: 0,
    paddingRight: "16px",
  },
  labelSmall: {
    paddingRight: "16px",
  },
})(Chip);

const paperdetails = ({ data, error }) => {
  const { title, authors, tags } = data;
  const { setAlert, unsetAlert } = useContext(AlertContext);

  const router = useRouter();
  const refresh = () => {
    router.reload();
    unsetAlert();
  };

  useEffect(() => {
    console.log(data);
    if (error || (data && data.error)) {
      setAlert(
        "Error Getting Paper Data !",
        "There was error trying to get paper details. Please try again ! If problems persist please contact the administrator.",
        <SmallStyledButton onClick={refresh}>Retry</SmallStyledButton>
      );
    }
  }, []);

  return (
    <Fragment>
      <SEO title="Qresp | Paper" description={title} author={authors} />
      <Container>
        <Box mt={5}>
          <Typography variant="h4" gutterBottom>
            <Box fontWeight="bold">{title}</Box>
          </Typography>
          <Typography variant="subtitle1" color="secondary" gutterBottom>
            by {authors}
          </Typography>
        </Box>
        {tags.map((tag) => (
          <StyledChip label={tag} key={tag} size="small" />
        ))}
      </Container>
    </Fragment>
  );
};

export async function getServerSideProps(ctx) {
  // Query contains the args from the url
  const { query } = ctx;

  var error = false;
  var data = null;

  try {
    const response = await apiEndpoint.get("/api/paper/" + query.id);
    data = response.data;
  } catch (e) {
    console.error(e);
    error = true;
  }

  return {
    props: { data, error },
  };
}

export default paperdetails;
