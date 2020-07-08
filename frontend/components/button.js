import PropTypes from "prop-types";
import Link from "next/link";
import { Box, Button } from "@material-ui/core";
import { withStyles } from "@material-ui/core/styles";

const NavButton = withStyles({
  root: {
    backgroundColor: "#800000",
    fontSize: "16px",
    color: "#FFF",
    "&:hover": {
      backgroundColor: "#9a0000",
    },
  },
})(Button);

const StyledButton = (props) => {
  const { text, url, external } = props;

  return (
    <Box display="flex" flexDirection="column" alignItems="center" m={1}>
      {external ? (
        <NavButton
          variant="text"
          color="inherit"
          size="large"
          href={url}
          target="_black"
          rel="noopener"
        >
          {text}
        </NavButton>
      ) : (
        <Link href={url}>
          <NavButton variant="text" color="inherit" size="large">
            {text}
          </NavButton>
        </Link>
      )}
    </Box>
  );
};

StyledButton.defaultProps = {
  external: false,
};

StyledButton.propTypes = {
  text: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
  external: PropTypes.bool,
};

export default StyledButton;
