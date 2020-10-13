import PropTypes from "prop-types";
import Link from "next/link";
import { Button } from "@material-ui/core";
import { withStyles, useTheme } from "@material-ui/core/styles";

const StyledButton = withStyles({
  root: {
    backgroundColor: "#800000",
    fontSize: "18px",
    color: "#FFF",
    "&:hover": {
      backgroundColor: "#B30000",
      borderColor: "#800000",
    },
  },
  disabled: {
    backgroundColor: "#bdc3c7",
    borderColor: "#800000",
    textDecoration: "line-through",
  },
})(Button);

const SmallStyledButton = withStyles({
  root: {
    backgroundColor: "#800000",
    fontSize: "12px",
    margin: "4px",
    color: "#FFF",
    "&:hover": {
      backgroundColor: "#9a0000",
    },
  },
})(Button);

const RegularStyledButton = withStyles({
  root: {
    backgroundColor: "#800000",
    color: "#FFF",
    "&:hover": {
      backgroundColor: "#9a0000",
    },
  },
  disabled: {
    backgroundColor: "#bdc3c7",
    borderColor: "#800000",
  },
})(Button);

const ExternalStyledButton = (props) => {
  const { text, url } = props;

  return (
    <StyledButton
      variant="text"
      color="inherit"
      size="large"
      href={url}
      target="_blank"
      rel="noopener"
    >
      {text}
    </StyledButton>
  );
};

const InternalStyledButton = (props) => {
  const { text, url } = props;

  return (
    <Link href={url}>
      <StyledButton variant="text" color="inherit" size="large">
        {text}
      </StyledButton>
    </Link>
  );
};

ExternalStyledButton.propTypes = {
  text: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
};

InternalStyledButton.propTypes = {
  text: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
};

export {
  InternalStyledButton,
  ExternalStyledButton,
  SmallStyledButton,
  RegularStyledButton,
};
export default StyledButton;
