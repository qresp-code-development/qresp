import { Chip, withStyles } from "@material-ui/core";

const Tag = withStyles({
  root: {
    margin: "2px 4px",
    color: "#999",
    background: "#e0e0e0",
    clipPath: "polygon(0% 0%, 93% 0, 100% 50%, 93% 100%, 0 100%)",
    borderRadius: "2px",
  },
  labelSmall: {
    paddingRight: "12px",
  },
})(Chip);

export default Tag;
