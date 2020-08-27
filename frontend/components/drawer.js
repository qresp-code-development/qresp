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
  const { heading, children, defaultOpen } = props;
  return (
    <StyledAccordion
      elevation={4}
      square={true}
      TransitionProps={{ timeout: 250 }}
      defaultExpanded={defaultOpen}
      id={heading.toLowerCase()}
    >
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

Drawer.defaultProps = {
  defaultOpen: false,
};

Drawer.propTypes = {
  heading: PropTypes.string.isRequired,
  children: PropTypes.any,
  defaultOpen: PropTypes.bool,
};

export default Drawer;
