import { useState } from "react";

import { Grid, withStyles, IconButton } from "@material-ui/core";
import { CSSTransition } from "react-transition-group";
import {
  KeyboardArrowRightRounded,
  KeyboardArrowLeftRounded,
} from "@material-ui/icons";

const StyledButton = withStyles({
  root: {
    paddingLeft: 0,
    paddingRight: 0,
  },
})(IconButton);

import styles from "./Slider.module.css";

const Slider = ({ children }) => {
  const [checked, setChecked] = useState(false);

  const handleChange = async () => {
    setChecked((prev) => !prev);
  };

  if (!children) {
    return null;
  }

  return (
    <Grid container direction="row">
      <Grid item xs={2}>
        <StyledButton onClick={handleChange}>
          {checked ? (
            <KeyboardArrowLeftRounded />
          ) : (
            <KeyboardArrowRightRounded />
          )}
        </StyledButton>
      </Grid>
      <CSSTransition
        in={checked}
        timeout={300}
        classNames={{
          enter: styles.enter,
          enterActive: styles.enterActive,
          exit: styles.exit,
          exitActive: styles.exitActive,
        }}
        unmountOnExit
      >
        <Grid
          item
          xs={9}
          container
          direction="row"
          justify="space-between"
          spacing={1}
        >
          {children.map((child, index) => {
            return (
              <Grid item key={index}>
                {child}
              </Grid>
            );
          })}
        </Grid>
      </CSSTransition>
    </Grid>
  );
};

export default Slider;
