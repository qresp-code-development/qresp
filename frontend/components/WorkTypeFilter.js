import PropTypes from "prop-types";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";

import { WORK_TYPES, WORK_TYPE_KEYS, workTypeOf } from "../Utils/workTypes";

export const ALL_WORK_TYPES = "all";

// A row's work type. Records from servers that predate work types carry none
// and are published papers, exactly as their type badge says.
export const rowWorkType = (row) =>
  workTypeOf(row && row.paper && row.paper._Search__work_type);

export const filterRowsByWorkType = (rows, type) =>
  type === ALL_WORK_TYPES ? rows : rows.filter((row) => rowWorkType(row) === type);

// Explore's "what kind of record?" choice: All (default) or one work type,
// each with how many of the loaded records it would show.
const WorkTypeFilter = ({ rows, value, onChange }) => {
  const counts = {};
  rows.forEach((row) => {
    const type = rowWorkType(row);
    counts[type] = (counts[type] || 0) + 1;
  });

  const options = [
    { key: ALL_WORK_TYPES, label: "All", count: rows.length },
    ...WORK_TYPE_KEYS.map((key) => ({
      key,
      label: WORK_TYPES[key].plural,
      count: counts[key] || 0,
    })),
  ];

  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      // Clicking the selected option again would clear it; keep a choice.
      onChange={(_e, next) => next && onChange(next)}
      aria-label="Show records of type"
      sx={{ flexWrap: "wrap", gap: 0.75, mb: 2, "& .MuiToggleButtonGroup-grouped": { border: "1px solid #ccc !important", borderRadius: "16px !important", px: 1.5, py: 0.25, textTransform: "none" }, "& .Mui-selected": { backgroundColor: "#800000 !important", color: "#fff !important", borderColor: "#800000 !important" } }}
    >
      {options.map(({ key, label, count }) => (
        <ToggleButton key={key} value={key} aria-label={`${label} (${count})`}>
          {`${label} (${count})`}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};

WorkTypeFilter.propTypes = {
  rows: PropTypes.array.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default WorkTypeFilter;
