import { Tooltip, tooltipClasses } from "@mui/material";
import { styled } from "@mui/material/styles";

// MUI v5+: withStyles is gone; style the tooltip slot through the popper class.
const StyledTooltip = styled(({ className, ...props }) => (
  <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    fontSize: theme.typography.subtitle2.fontSize,
  },
}));

export default StyledTooltip;
