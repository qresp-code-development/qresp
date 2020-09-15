import { useContext, useState, useEffect } from "react";

import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  useTheme,
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
  } = useContext(SourceTreeContext);

  const [expanded, setExpanded] = useState([]);

  useEffect(() => {
    setExpanded([]);
    setChecked([]);
  }, [tree]);

  const theme = useTheme();

  return (
    <Dialog open={showSelector} onClose={closeSelector} maxWidth="sm" fullWidth>
      <DialogTitle onClose={closeSelector}>{title}</DialogTitle>
      <DialogContent>
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
      <DialogActions>
        <RegularStyledButton>Save</RegularStyledButton>
        <RegularStyledButton onClick={closeSelector}>
          Cancel
        </RegularStyledButton>
      </DialogActions>
    </Dialog>
  );
};

export default FileTree;
