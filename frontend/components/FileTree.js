import { useContext, useState, useEffect } from "react";

import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  useTheme,
  Typography,
  Box,
  Grid,
} from "@material-ui/core";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  faChevronRight,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";

import {
  faCheckSquare,
  faSquare,
  faPlusSquare,
  faMinusSquare,
  faFolder,
  faFolderOpen,
  faFile,
} from "@fortawesome/free-regular-svg-icons";

import CheckboxTree from "react-checkbox-tree";

import { RegularStyledButton } from "../components/button";

import SourceTreeContext from "../Context/SourceTree/SourceTreeContext";

const FileTree = () => {
  const {
    tree,
    showSelector,
    closeSelector,
    checked,
    setChecked,
    title,
    multiple,
    save,
  } = useContext(SourceTreeContext);

  const [expanded, setExpanded] = useState([]);

  useEffect(() => {
    setExpanded([]);
    setChecked([]);
  }, [tree]);

  const theme = useTheme();

  return (
    <Dialog open={showSelector} onClose={closeSelector} maxWidth="md" fullWidth>
      <DialogTitle onClose={closeSelector} disableTypography>
        <Grid container direction="column" spacing={1} justify="center">
          <Grid item container spacing={1}>
            <Grid item xs={12} sm={9}>
              <Typography variant="h6">
                {multiple
                  ? title
                  : checked.length == 0
                  ? title
                  : "Current Selection:"}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={3} container spacing={1}>
              <Grid item xs={6}>
                <RegularStyledButton
                  fullWidth
                  onClick={() => {
                    save(checked[0]);
                    closeSelector();
                  }}
                  disabled={checked.length == 0}
                >
                  Save
                </RegularStyledButton>
              </Grid>
              <Grid item xs={6}>
                <RegularStyledButton onClick={closeSelector} fullWidth>
                  Cancel
                </RegularStyledButton>
              </Grid>
            </Grid>
          </Grid>
          {!multiple ? (
            <Grid item xs={12}>
              <Typography variant="body1" component="div">
                <Box
                  style={{
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "4px",
                    padding: "8px",
                    borderColor: theme.palette.secondary.main,
                  }}
                >
                  {checked.length == 0
                    ? "Nothing currently selected"
                    : checked[0]}
                </Box>
              </Typography>
            </Grid>
          ) : null}
        </Grid>
      </DialogTitle>
      <DialogContent dividers>
        <CheckboxTree
          nodes={tree}
          checked={checked}
          expanded={expanded}
          onCheck={(newChecked) => {
            if (!multiple) {
              setChecked(newChecked.filter((el) => !checked.includes(el)));
              return;
            }
            setChecked(newChecked);
          }}
          onExpand={(expanded) => setExpanded(expanded)}
          iconsClass="fa5"
          icons={{
            check: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-check"
                icon={faCheckSquare}
                color={theme.palette.primary.main}
              />
            ),
            uncheck: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-uncheck"
                icon={faSquare}
              />
            ),
            halfCheck: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-half-check"
                icon={faCheckSquare}
              />
            ),
            expandClose: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-expand-close"
                icon={faChevronRight}
              />
            ),
            expandOpen: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-expand-open"
                icon={faChevronDown}
              />
            ),
            expandAll: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-expand-all"
                icon={faPlusSquare}
              />
            ),
            collapseAll: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-collapse-all"
                icon={faMinusSquare}
              />
            ),
            parentClose: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-parent-close"
                icon={faFolder}
                color={theme.palette.primary.main}
              />
            ),
            parentOpen: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-parent-open"
                icon={faFolderOpen}
                color={theme.palette.primary.main}
              />
            ),
            leaf: (
              <FontAwesomeIcon
                className="rct-icon rct-icon-leaf-close"
                icon={faFile}
                color={theme.palette.primary.main}
              />
            ),
          }}
          noCascade
        />
      </DialogContent>
    </Dialog>
  );
};

export default FileTree;
