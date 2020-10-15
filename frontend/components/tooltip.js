import { withStyles, Tooltip } from "@material-ui/core";

const StyledTooltip = withStyles((theme) => ({
  tooltip: {
    // backgroundColor: "#f5f5f9",
    // color: "rgba(0, 0, 0, 0.87)",
    fontSize: theme.typography.subtitle2.fontSize,
    // border: "1px solid #dadde9",
  },
}))(Tooltip);

export default StyledTooltip;
