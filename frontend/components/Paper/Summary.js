import { useContext } from "react";
import PropTypes from "prop-types";

import Link from "next/link";
import { Chip, Tooltip, Typography, Box } from "@mui/material";
import {
  EditOutlined,
  LockOutlined,
  OpenInNew,
  PeopleOutlined,
  PersonOutlined,
} from "@mui/icons-material";

import Tag from "../tag";
import FavoriteButton from "../FavoriteButton";

import { TableSearchContext } from "../Table/TableSearch";
import { WORK_TYPE_ICONS } from "../CuratorElements/WorkTypeChooser";
import { workTypeInfo, workTypeOf } from "../../Utils/workTypes";

// How the signed-in reader relates to a listed record. The backend fills
// _Search__my_role for the requesting session only, so these labels are
// never shown to anyone else.
const ROLE_LABELS = {
  owner: { label: "Your record", icon: <PersonOutlined />, color: "primary" },
  editor: { label: "Editor", icon: <EditOutlined />, color: "default" },
  viewer: { label: "Shared with you", icon: <PeopleOutlined />, color: "default" },
};

const Summary = ({ rowdata }) => {
  const {
    _Search__authors,
    _Search__doi,
    _Search__id,
    _Search__institution,
    _Search__is_private,
    _Search__my_role,
    _Search__work_type,
    _Search__publication,
    _Search__tags,
    _Search__title,
    _Search__server,
    _Search__year,
  } = rowdata;

  const { setQuery } = useContext(TableSearchContext);
  const role = ROLE_LABELS[_Search__my_role];
  // Published papers (and every record from an older server) carry no badge.
  const workType = workTypeOf(_Search__work_type);
  const WorkTypeIcon = WORK_TYPE_ICONS[workType];

  // `_Search__sources` is still built and still carried on the row -- it is
  // what dedupe uses to merge a paper published on two nodes into one line,
  // and `_Search__server` is what the detail link routes by. It is simply not
  // RENDERED: which node served a copy is infrastructure, not a fact about
  // the paper, and showing it as a badge invited it to be read as one.

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
        {/* Next 13+ <Link> renders the anchor itself (no child <a>);
            the resolved pathname+query go straight into href. */}
        <Box
          component={Link}
          href={{
            pathname: "/paperdetails/" + _Search__id,
            query: { server: _Search__server },
          }}
          sx={{
            flex: 1,
            minWidth: 0,
            color: "#1f1f1f",
            textDecoration: "none",
            "&:hover": { color: "#800000", textDecoration: "underline" },
          }}
        >
          <Typography
            variant="subtitle1"
            component="div"
            sx={{ fontWeight: 700, fontSize: "1.05rem", lineHeight: 1.35 }}
          >
            {/* Nothing is required to publish, a title included. */}
            {_Search__title || "Untitled record"}
          </Typography>
        </Box>
        {/* The backend lists a private record only to sessions that may
            open it (owner, editors, collaborators, admins), so the badge
            tells them this card is not visible to the public. */}
        {workType !== "paper" ? (
          <Chip
            icon={<WorkTypeIcon />}
            label={workTypeInfo(workType).short}
            size="small"
            variant="outlined"
            data-testid="record-work-type-badge"
            sx={{ flexShrink: 0, mt: 0.25 }}
          />
        ) : null}
        {role ? (
          <Chip
            icon={role.icon}
            label={role.label}
            size="small"
            variant="outlined"
            color={role.color}
            data-testid="record-role-badge"
            sx={{ flexShrink: 0, mt: 0.25 }}
          />
        ) : null}
        {_Search__is_private ? (
          <Tooltip title="Private: only you and the people it is shared with can see this record">
            <Chip
              icon={<LockOutlined />}
              label="Private"
              size="small"
              variant="outlined"
              data-testid="record-private-badge"
              sx={{ flexShrink: 0, mt: 0.25 }}
            />
          </Tooltip>
        ) : null}
        <FavoriteButton
          paperId={_Search__id}
          server={_Search__server}
          title={_Search__title}
          authors={_Search__authors}
          year={_Search__year}
        />
      </Box>

      {/* The author line and, when a curator entered one, the record's
          Institution -- right after the author text, and wrapping rather than
          overlapping the year column.

          There is deliberately NO badge naming the Qresp node this copy was
          read from. A node is shared federation and search infrastructure;
          which one served a record says nothing about who did the work, and a
          public card reading "Hosted by University of Chicago" beside a paper
          written elsewhere invites exactly that misreading. The node is still
          tracked internally -- `_Search__server` still routes the detail link,
          dedupe still merges copies across nodes, and a node that fails is
          still reported -- it is just not presented as a property of the paper.

          Institution is the only institutional claim shown here, it is typed
          by a curator, and it is never inferred from the server, the authors,
          a DOI or a collection. */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 1,
          rowGap: 0.5,
          mt: 0.5,
          minWidth: 0,
        }}
      >
        <Typography
          variant="body2"
          component="span"
          sx={{ color: "#555", wordBreak: "break-word" }}
        >
          {_Search__authors}
        </Typography>
        {_Search__institution ? (
          // The visible text carries the whole meaning, so a reader never has
          // to infer what a bare institution name beside a title is claiming.
          <Chip
            size="small"
            variant="outlined"
            label={`Institution: ${_Search__institution}`}
            data-testid="record-institution"
            sx={{ maxWidth: "100%" }}
          />
        ) : null}
      </Box>

      {_Search__publication ? (
        <Box
          component={_Search__doi ? "a" : "div"}
          href={_Search__doi ? "https://doi.org/" + _Search__doi : undefined}
          target={_Search__doi ? "_blank" : undefined}
          rel={_Search__doi ? "noopener noreferrer" : undefined}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            mt: 0.5,
            color: "#800000",
            fontStyle: "italic",
            fontSize: "0.875rem",
            textDecoration: "none",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          {_Search__publication}
          {_Search__doi ? <OpenInNew sx={{ fontSize: 14, fontStyle: "normal" }} /> : null}
        </Box>
      ) : null}

      {_Search__tags && _Search__tags.length > 0 && (
        <Box sx={{ mt: 1 }}>
          {_Search__tags.map((tag) => (
            <Tag
              label={tag
                .slice(0, 32)
                .trim()
                .concat(tag.length > 32 ? "..." : "")}
              key={tag}
              size="small"
              onClick={() => {
                setQuery(tag);
                window.scrollTo(0, 0);
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

Summary.propTypes = {
  rowdata: PropTypes.object.isRequired,
};

export default Summary;
