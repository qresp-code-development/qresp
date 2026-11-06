import { Chip, chipClasses } from "@mui/material";
import { styled } from "@mui/material/styles";

const Tag = styled(Chip)({
  margin: "1px 4px 1px 0px",
  color: "#999",
  background: "#e0e0e0",
  clipPath: "polygon(0% 0%, 93% 0, 100% 50%, 93% 100%, 0 100%)",
  borderRadius: "2px",
  [`& .${chipClasses.labelSmall}`]: {
    paddingRight: "12px",
  },
  [`&.${chipClasses.clickable}:hover`]: {
    background: "#800000",
    color: "#FFF",
  },
});

export default Tag;
