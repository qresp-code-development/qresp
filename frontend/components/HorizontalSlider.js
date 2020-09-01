import { useState } from "react";

import { Grid, IconButton, useTheme } from "@material-ui/core";
import { KeyboardArrowRightRounded } from "@material-ui/icons";

const Slider = ({ children }) => {
  const [checked, setChecked] = useState(false);

  const handleChange = async () => {
    setChecked(!checked);
  };

  if (!children) {
    return null;
  }

  const theme = useTheme();

  return (
    <Grid container direction="row" alignItems="center" justify="flex-start">
      <Grid item xs={2}>
        <IconButton
          onClick={handleChange}
          size="small"
          style={{ background: theme.palette.primary.main, color: "#FFF" }}
        >
          <div className="rotateIcon">
            <KeyboardArrowRightRounded fontSize="small" />
          </div>
        </IconButton>
        <style jsx>
          {`
          .rotateIcon {
            display: inherit;
            align-items: inherit;
            justify-content: inherit;
            margin:auto;
            transform: rotate(0deg);
            transition: all 0.3s linear;
            transform: ${checked ? `rotate(180deg)` : ""};          }
          }
        `}
        </style>
      </Grid>
      <Grid
        item
        xs={9}
        container
        direction="row"
        justify="space-between"
        alignItems="center"
        spacing={1}
      >
        <div className="expand">
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
        </div>
        <style jsx>
          {`
            .expand {
              width: 100%;
              display: inherit;
              align-items: inherit;
              justify-content: inherit;
              margin: auto;
              transform: scaleX(0);
              overflow: hidden;
              transform-origin: -10% 50%;
              transition: all 0.3s linear;
              transform: ${checked ? `scaleX(1)` : ""};
            }
          `}
        </style>
      </Grid>
    </Grid>
  );
};

export default Slider;
