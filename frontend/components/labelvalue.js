import PropTypes from "prop-types";

import { Typography, withStyles, Grid } from "@material-ui/core";

const BigTypography = withStyles({
  body1: {
    fontSize: "1.15rem",
    color: "#777777",
    textAlign: "justify",
  },
})(Typography);

const LabelValue = ({ label, value, link, image }) => {
  if (typeof value === "array") {
    value = value.join(",");
  }

  return (
    <div>
      <BigTypography variant="body1" color="secondary" component="div">
        <Grid
          container
          direction="row"
          alignItems="center"
          justify="flex-start"
        >
          <Grid item>
            <span>{label}:&nbsp;&nbsp;</span>
          </Grid>
          <Grid item>
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferer">
                {image ? <img src={image} alt={value} /> : value}
              </a>
            ) : (
              value
            )}
          </Grid>
        </Grid>
      </BigTypography>
      <style jsx>
        {`
          span {
            font-weight: bold;
          }
          div {
            margin: 8px 0px;
          }
          a {
            color: #007bff;
            margin: auto;
          }
          a:hover {
            color: #777777;
          }
          img {
            display: inline-block;
            vertical-align: middle;
            height: 28px;
            width: 28px;
          }
        `}
      </style>
    </div>
  );
};

LabelValue.defaultProps = {
  link: null,
  image: null,
  textVariant: "",
};

LabelValue.propTypes = {
  textVariant: PropTypes.string,
  image: PropTypes.string,
  link: PropTypes.string,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([
    PropTypes.string.isRequired,
    PropTypes.array.isRequired,
    PropTypes.object.isRequired,
  ]),
};

export default LabelValue;
