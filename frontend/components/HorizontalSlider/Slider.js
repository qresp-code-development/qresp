import { useState } from "react";

import { Grid, IconButton } from "@material-ui/core";
import { CSSTransition } from "react-transition-group";
import {
  KeyboardArrowRightRounded,
  KeyboardArrowLeftRounded,
} from "@material-ui/icons";

import styles from "./Slider.module.css";

const Slider = ({ children }) => {
  const [checked, setChecked] = useState(false);

  const handleChange = async () => {
    setChecked(!checked);
  };

  if (!children) {
    return null;
  }

  return (
    <Grid container direction="row" alignItems="center">
      <Grid item xs={2}>
        <IconButton onClick={handleChange}>
          {checked ? (
            <KeyboardArrowLeftRounded />
          ) : (
            <KeyboardArrowRightRounded />
          )}
        </IconButton>
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
          alignItems="center"
          spacing={1}
        >
          {Array.isArray(children) ? (
            children.map((child, index) => {
              return (
                <Grid item key={index}>
                  {child}
                </Grid>
              );
            })
          ) : (
            <Grid item key={index}>
              {children}
            </Grid>
          )}
        </Grid>
      </CSSTransition>
    </Grid>
  );
};

export default Slider;
