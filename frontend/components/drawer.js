import { useState } from "react";
import PropTypes from "prop-types";

import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  withStyles,
  Typography,
  Box,
  IconButton,
  Tooltip,
} from "@material-ui/core";
import { ExpandMore, Edit } from "@material-ui/icons";

const StyledAccordion = withStyles({
  root: {
    borderRadius: "0.5em",
    margin: "8px 0 !important",
    "&::before": {
      backgroundColor: "rgba(0,0,0,0.03)",
    },
  },
})(Accordion);

const StyledAccordionSummary = withStyles({
  root: {
    backgroundColor: "rgba(0,0,0,.03)",
  },
})(AccordionSummary);

const Drawer = (props) => {
  const { heading, children, defaultOpen, editor } = props;

  const [open, setOpen] = useState(defaultOpen ? true : false);

  return (
    <StyledAccordion
      elevation={4}
      square={true}
      TransitionProps={{ timeout: 200 }}
      id={heading.toLowerCase()}
      expanded={open}
      onChange={(event, expanded) => {
        setOpen(expanded);
      }}
    >
      <StyledAccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="h4" style={{ color: "#333333" }}>
          <Box fontWeight="bold">
            {heading}
            {editor ? (
              <Tooltip
                title={<Typography variant="subtitle2">Edit</Typography>}
                placement="right"
                arrow
              >
                <IconButton onClick={editor}>
                  <Edit color="primary" />
                </IconButton>
              </Tooltip>
            ) : null}
          </Box>
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
  editor: PropTypes.func,
};

export default Drawer;
