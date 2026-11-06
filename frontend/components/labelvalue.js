import PropTypes from "prop-types";

import { Typography, Grid } from "@mui/material";
import { styled } from "@mui/material/styles";

// withStyles' per-variant class keys map onto the variant classes.
const BigTypography = styled(Typography)({
  "&.MuiTypography-body1": {
    fontSize: "1.15rem",
    color: "#777777",
    textAlign: "justify",
  },
  "&.MuiTypography-body2": {
    fontSize: "0.95rem",
    color: "#777777",
    textAlign: "justify",
  },
});

const SimpleLabelValue = ({ label, value, direction = "row" }) => {
  return (
    <div>
      <Grid
        container
        direction={direction} sx={{ alignItems: "center", justifyContent: "flex-start" }}>
        <Grid>
          <Typography variant="body2" color="secondary" component="span">
            <span>{label}:&nbsp;&nbsp;</span>
          </Typography>
        </Grid>
        <Grid>
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

SimpleLabelValue.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  direction: PropTypes.string,
};

const LabelValue = ({
  label,
  value,
  link = null,
  image = null,
  textVariant = "body1",
  direction = "row",
}) => {
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    value = value.join(", ");
  }

  return (
    <div>
      <Grid
        container
        direction={direction} sx={{ alignItems: "center", justifyContent: "flex-start" }}>
        {label && (
          <Grid>
            <BigTypography variant="body1" color="secondary" component="div">
              <span>
                {label}
                {label && value && ":"}&nbsp;&nbsp;
              </span>
            </BigTypography>
          </Grid>
        )}
        {value && (
          <Grid>
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
