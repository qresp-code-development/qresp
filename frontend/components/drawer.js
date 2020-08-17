import PropTypes from "prop-types";

import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  withStyles,
  Typography,
  Box,
} from "@material-ui/core";
import { ExpandMore } from "@material-ui/icons";

const StyledAccordion = withStyles({
  root: {
    borderRadius: "5px",
  },
})(Accordion);

const StyledAccordionSummary = withStyles({
  root: {
    backgroundColor: "rgba(0,0,0,.03)",
  },
})(AccordionSummary);

const Drawer = (props) => {
  const { heading, children, id } = props;
  return (
    <StyledAccordion
      elevation={4}
      square={true}
      TransitionProps={{ timeout: 250 }}
      defaultExpanded
    >
      {id ? <div id={id}></div> : null}
      <StyledAccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="h4" style={{ color: "#333333" }}>
          <Box fontWeight="bold">{heading}</Box>
        </Typography>
      </StyledAccordionSummary>
      <AccordionDetails>
        <Box display="flex" flexDirection="column" style={{ width: "100%" }}>
          {children}
        </Box>
      </AccordionDetails>
    </StyledAccordion>
  );
};

export { StyledAccordion, StyledAccordionSummary };

Drawer.propTypes = {
  heading: PropTypes.string.isRequired,
  children: PropTypes.any,
  id: PropTypes.string,
};

export default Drawer;
