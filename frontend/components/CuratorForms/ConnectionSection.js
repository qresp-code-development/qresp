import { useContext, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useWatch } from "react-hook-form";
import {
  Alert,
  Box,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";

import CuratorContext from "../../Context/Curator/curatorContext";
import { EDGE_VERB, UNDIRECTED } from "../../Utils/workflowGraph";
import {
  NEW_TO_SOURCE,
  SOURCE_TO_NEW,
  connectionProblem,
  defaultConnection,
  directionText,
  draftName,
  isRowScoped,
  newEndpointLabel,
  relationshipsFor,
  sourceEndpointLabel,
  withDirection,
} from "../../Utils/connectionIntent";

/**
 * The connection a row-scoped create will make, held from the moment the
 * form opens. `null` for every other kind of create, so an independent form
 * renders nothing extra and behaves exactly as it always has.
 *
 * Keyed on the intent object itself: a new LINK opens a new intent, and gets
 * a fresh default; typing, validation errors and re-renders keep the choice.
 */
const useConnectionChoice = (intent, newType) => {
  const [held, setHeld] = useState(() => ({
    intent,
    choice: isRowScoped(intent) ? defaultConnection(intent, newType) : null,
  }));
  if (held.intent !== intent) {
    const next = {
      intent,
      choice: isRowScoped(intent) ? defaultConnection(intent, newType) : null,
    };
    setHeld(next);
    return [next.choice, (choice) => setHeld({ intent, choice })];
  }
  return [held.choice, (choice) => setHeld({ intent, choice })];
};

/**
 * EVERYTHING A CREATE PATH NEEDS TO CREATE-AND-LINK, in one place.
 *
 * The four artifact forms, the External data dialog and the RCC importer
 * all call this with the intent they were opened with. `createAndLink`
 * checks the connection with the canonical `edgeProblem` and, only if it is
 * allowed, makes the records and their arrows in ONE reducer change; it
 * returns false, and leaves the caller open to say why, when it is not. For
 * an independent intent `rowScoped` is false and the caller saves exactly as
 * it always has.
 */
export const useRowLink = (type, intent) => {
  const { addAndLink, charts, scripts, datasets, tools, heads, workflow } =
    useContext(CuratorContext) || {};
  const [choice, setChoice] = useConnectionChoice(intent, type);
  const [problem, setProblem] = useState("");
  // One intent, one record: a second submit before the form closes is
  // ignored rather than creating a twin.
  const done = useRef(null);
  const rowScoped = isRowScoped(intent);

  const refuse = (message) => {
    setProblem(message);
    return false;
  };

  // `records` is one form's values, or an importer's batch of one kind.
  const createAndLink = (records) => {
    if (done.current === intent) return false;
    const knownIds = [charts, scripts, datasets, tools, heads].flatMap(
      (list) => (list || []).map((item) => item.id)
    );
    const found = connectionProblem(
      intent,
      type,
      choice,
      knownIds,
      (workflow && workflow.edges) || []
    );
    if (found) return refuse(found);
    done.current = intent;
    // Ids are the reducer's to mint; a caller-computed one is dropped.
    const batch = (Array.isArray(records) ? records : [records]).map(
      ({ id: ignored, ...record }) => record // eslint-disable-line no-unused-vars
    );
    addAndLink(type, batch, intent, choice);
    return true;
  };

  return {
    rowScoped,
    intent,
    choice,
    problem,
    setChoice: (next) => {
      setProblem("");
      setChoice(next);
    },
    createAndLink,
    refuse,
  };
};

/** The label the confirm button carries for this intent. */
export const confirmLabel = (intent, fallback) =>
  isRowScoped(intent) ? "Create and link" : fallback;

/**
 * DIRECTION AND RELATIONSHIP, before anything is created.
 *
 * Both ends are written out -- "Dataset: short_traj -> Script: analysis.py",
 * never "selected" -- and the arrow is a radio group, so it is chosen with
 * the keyboard as easily as the mouse and is never inferred silently.
 * Relationships offered are exactly the ones the canonical edge rules allow
 * for this pair in this direction.
 */
const ConnectionSection = ({ intent, newType, name, choice, onChange, problem }) => {
  if (!isRowScoped(intent) || !choice) return null;
  const valid = relationshipsFor(intent, newType, choice.direction);
  const undirected = UNDIRECTED.includes(choice.type);
  const mine = newEndpointLabel(newType, name);
  const theirs = sourceEndpointLabel(intent);
  const [from, to] =
    choice.direction === NEW_TO_SOURCE ? [mine, theirs] : [theirs, mine];

  return (
    <Box
      data-testid="connection-section"
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 1.5,
        my: 1.5,
        minWidth: 0,
      }}
    >
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
        Connection
      </Typography>

      <FormControl component="fieldset" disabled={undirected} sx={{ minWidth: 0 }}>
        <FormLabel component="legend" sx={{ fontSize: 12 }}>
          Direction
        </FormLabel>
        <RadioGroup
          value={choice.direction}
          onChange={(event) =>
            onChange(withDirection(intent, newType, choice, event.target.value))
          }
        >
          {[NEW_TO_SOURCE, SOURCE_TO_NEW].map((direction) => (
            <FormControlLabel
              key={direction}
              value={direction}
              control={
                <Radio
                  size="small"
                  slotProps={{
                    input: { "data-testid": `connection-dir-${direction}` },
                  }}
                />
              }
              label={
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                  {directionText(intent, newType, name, direction, choice.type)}
                </Typography>
              }
              sx={{ minWidth: 0, mr: 0 }}
            />
          ))}
        </RadioGroup>
      </FormControl>

      <TextField
        select
        fullWidth
        size="small"
        label="Relationship"
        value={choice.type}
        onChange={(event) => onChange({ ...choice, type: event.target.value })}
        slotProps={{
          select: { native: true },
          htmlInput: { "data-testid": "connection-type" },
        }}
        sx={{ mt: 1.5 }}
      >
        {valid.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </TextField>

      <Typography
        variant="body2"
        data-testid="connection-summary"
        sx={{ mt: 1.5, overflowWrap: "anywhere" }}
      >
        {undirected
          ? `${from} ↔ ${EDGE_VERB[choice.type]} ↔ ${to}`
          : `${from} → ${choice.type} → ${to}`}
      </Typography>

      {problem ? (
        <Alert
          severity="error"
          variant="outlined"
          data-testid="connection-problem"
          sx={{ mt: 1, py: 0 }}
        >
          {problem}
        </Alert>
      ) : null}
    </Box>
  );
};

ConnectionSection.propTypes = {
  intent: PropTypes.object,
  newType: PropTypes.string.isRequired,
  name: PropTypes.string,
  choice: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  problem: PropTypes.string,
};

export default ConnectionSection;

// The fields a record's name can come from; see `draftName`.
const NAME_FIELDS = [
  "caption",
  "packageName",
  "programName",
  "facilityName",
  "label",
  "readme",
];

// Subscribes to the name fields ONLY here, so a keystroke re-renders this
// small section and not the whole form around it.
const WatchedConnection = ({ control, newType, link }) => {
  const values = useWatch({ control, name: NAME_FIELDS });
  const named = {};
  NAME_FIELDS.forEach((field, index) => {
    named[field] = values[index];
  });
  return (
    <ConnectionSection
      intent={link.intent}
      newType={newType}
      name={draftName(named)}
      choice={link.choice}
      onChange={link.setChoice}
      problem={link.problem}
    />
  );
};

/**
 * The connection section for a react-hook-form form. Renders -- and
 * subscribes to -- nothing at all unless the form was opened from a row's
 * LINK, so an ordinary create or edit costs exactly what it did before.
 */
export const FormConnection = ({ control, newType, link }) =>
  link && link.rowScoped ? (
    <WatchedConnection control={control} newType={newType} link={link} />
  ) : null;

FormConnection.propTypes = {
  control: PropTypes.object.isRequired,
  newType: PropTypes.string.isRequired,
  link: PropTypes.object,
};
