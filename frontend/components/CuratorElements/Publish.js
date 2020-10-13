import { Box } from "@material-ui/core";
import StyledButton from "../button";

import axios from "axios";

const onClick = () => {
  console.log("Publish");
};

const Publish = () => {
  return (
    <Box my={3}>
      <StyledButton fullWidth onClick={onClick}>
        Publish
      </StyledButton>
    </Box>
  );
};

export default Publish;
