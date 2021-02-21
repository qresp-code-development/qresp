import PropTypes from "prop-types";

import { Typography, withStyles, Grid } from "@material-ui/core";

const BigTypography = withStyles({
  body1: {
    fontSize: "1.15rem",
    color: "#777777",
    textAlign: "justify",
  },
  body2: {
    fontSize: "0.95rem",
    color: "#777777",
    textAlign: "justify",
  },
})(Typography);

const SimpleLabelValue = ({ label, value, direction }) => {
  return (
    <div>
      <Grid
        container
        direction={direction}
        alignItems="center"
        justify="flex-start"
      >
        <Grid item>
          <Typography variant="body2" color="secondary" component="span">
            <span>{label}:&nbsp;&nbsp;</span>
          </Typography>
        </Grid>
        <Grid item>
          <Typography variant="body2" color="secondary" component="div">
            {value}
          </Typography>
        </Grid>
      </Grid>
      <style jsx>
        {`
          span {
            font-weight: bold;
          }
        `}
      </style>
    </div>
  );
};

SimpleLabelValue.defaultProps = {
  direction: "row",
};

SimpleLabelValue.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  direction: PropTypes.string,
};

const LabelValue = ({ label, value, link, image, textVariant, direction }) => {
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    value = value.join(", ");
  }

  return (
    <div>
      <Grid
        container
        direction={direction}
        alignItems="center"
        justify="flex-start"
      >
        {label && (
          <Grid item>
            <BigTypography variant="body1" color="secondary" component="div">
              <span>
                {label}
                {label && value && ":"}&nbsp;&nbsp;
              </span>
            </BigTypography>
          </Grid>
        )}
        {value && (
          <Grid item>
            <BigTypography
              variant={textVariant}
              color="secondary"
              component="div"
            >
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferer">
                  {image ? <img src={image} alt={value} /> : value}
                </a>
              ) : (
                value
              )}
            </BigTypography>
          </Grid>
        )}
      </Grid>
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
  textVariant: "body1",
  direction: "row",
};

LabelValue.propTypes = {
  textVariant: PropTypes.string,
  image: PropTypes.string,
  link: PropTypes.string,
  label: PropTypes.string,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.array,
    PropTypes.object,
  ]),
  direction: PropTypes.string,
};

export { SimpleLabelValue };
export default LabelValue;
