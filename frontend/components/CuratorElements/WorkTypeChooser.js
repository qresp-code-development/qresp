import { Fragment, useContext, useState } from "react";
import PropTypes from "prop-types";
import Link from "next/link";

import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import {
  ArticleOutlined,
  CategoryOutlined,
  CodeOutlined,
  DatasetOutlined,
  DescriptionOutlined,
  SwapHorizOutlined,
} from "@mui/icons-material";

import CuratorContext from "../../Context/Curator/curatorContext";
import { WORK_TYPES, WORK_TYPE_KEYS, workTypeInfo } from "../../Utils/workTypes";

export const WORK_TYPE_ICONS = {
  paper: ArticleOutlined,
  report: DescriptionOutlined,
  software: CodeOutlined,
  dataset: DatasetOutlined,
  other: CategoryOutlined,
};

const TypeCard = ({ type, selected, onSelect }) => {
  const Icon = WORK_TYPE_ICONS[type];
  const { label, description } = WORK_TYPES[type];
  return (
    <ButtonBase
      onClick={() => onSelect(type)}
      data-testid={`work-type-${type}`}
      aria-pressed={selected}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        gap: 2,
        p: 2.5,
        width: "100%",
        height: "100%",
        textAlign: "left",
        borderRadius: 3,
        border: "1px solid",
        borderColor: selected ? "primary.main" : "divider",
        bgcolor: selected ? "action.selected" : "background.paper",
        transition: "border-color 120ms, box-shadow 120ms",
        "&:hover": { borderColor: "primary.main", boxShadow: 2 },
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          width: 44,
          height: 44,
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "rgba(128,0,0,0.08)",
          color: "#800000",
        }}
      >
        <Icon />
      </Box>
      <Box>
        <Typography fontWeight={700}>{label}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {description}
        </Typography>
      </Box>
    </ButtonBase>
  );
};

TypeCard.propTypes = {
  type: PropTypes.string.isRequired,
  selected: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
};

const TypeGrid = ({ value, onSelect }) => (
  <Box
    role="list"
    sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
      gap: 1.5,
    }}
  >
    {WORK_TYPE_KEYS.map((type) => (
      <Box role="listitem" key={type}>
        <TypeCard type={type} selected={value === type} onSelect={onSelect} />
      </Box>
    ))}
  </Box>
);

TypeGrid.propTypes = { value: PropTypes.string, onSelect: PropTypes.func.isRequired };

// The first step of a NEW record: what kind of work is being curated. Shown
// before the curator forms; the choice decides which reference fields are
// asked for and what publishing requires (see Utils/workTypes.js).
const WorkTypeChooser = () => {
  const { setWorkType } = useContext(CuratorContext);
  return (
    <Box sx={{ mt: 4, mb: 8 }} data-testid="work-type-chooser">
      <Typography variant="h5" fontWeight={700}>
        What are you curating?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
        Qresp links any piece of research to the data, code and workflow
        behind it. Pick the closest match; you can change it later.
      </Typography>
      <TypeGrid onSelect={setWorkType} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        Continuing something you started?{" "}
        <Link href="/account/drafts">Open your drafts</Link>
      </Typography>
    </Box>
  );
};

// "Code repository · Change" in the curator header: what this record is,
// and a way to switch without starting over (nothing entered is lost).
export const WorkTypeBadge = () => {
  const { workType, setWorkType } = useContext(CuratorContext);
  const [open, setOpen] = useState(false);
  const Icon = WORK_TYPE_ICONS[workType] || ArticleOutlined;
  const choose = (type) => {
    setWorkType(type);
    setOpen(false);
  };
  return (
    <Fragment>
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
        <Chip
          icon={<Icon />}
          label={workTypeInfo(workType).label}
          variant="outlined"
          size="small"
          data-testid="work-type-current"
        />
        <Button
          size="small"
          startIcon={<SwapHorizOutlined fontSize="inherit" />}
          onClick={() => setOpen(true)}
          data-testid="work-type-change"
          sx={{ textTransform: "none" }}
        >
          Change
        </Button>
      </Box>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>What are you curating?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Changing the type keeps everything you have entered; it only changes
            which details Qresp asks about. None of them is required to publish.
          </Typography>
          <TypeGrid value={workType} onSelect={choose} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Fragment>
  );
};

export default WorkTypeChooser;
