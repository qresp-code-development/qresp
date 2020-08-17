import { Chip, withStyles } from "@material-ui/core";

const Tag = withStyles({
  root: {
    margin: "1px 4px 1px 0px",
    color: "#999",
    background: "#e0e0e0",
    clipPath: "polygon(0% 0%, 93% 0, 100% 50%, 93% 100%, 0 100%)",
    borderRadius: "2px",
  },
  labelSmall: {
    paddingRight: "12px",
  },
  clickable: {
    "&:hover": {
      background: "#800000",
      color: "#FFF",
    },
  },
})(Chip);

export default Tag;
