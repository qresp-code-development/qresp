import PropTypes from "prop-types";
import Link from "next/link";
import { Button } from "@material-ui/core";
import { withStyles } from "@material-ui/core/styles";

const StyledButton = withStyles({
  root: {
    backgroundColor: "#800000",
    fontSize: "18px",
    margin: "8px",
    color: "#FFF",
    "&:hover": {
      backgroundColor: "#9a0000",
    },
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

export { InternalStyledButton, ExternalStyledButton, SmallStyledButton };
export default StyledButton;
