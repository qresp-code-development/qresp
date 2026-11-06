import { useContext } from "react";
import { IconButton, Tooltip } from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";

import FavoritesContext from "../Context/Favorites/favoritesContext";
import AuthContext from "../Context/Auth/authContext";

const FavoriteButton = ({
  paperId,
  size = "small",
  server = "",
  title = "",
  authors = "",
  year = null,
}) => {
  const { authenticated } = useContext(AuthContext);
  const { loading, isFavorite, toggleFavorite } = useContext(FavoritesContext);

  if (!authenticated) return null;

  const favorited = isFavorite(paperId);

  return (
    <Tooltip title={favorited ? "Remove from favorites" : "Add to favorites"} placement="top">
      <IconButton
        size={size}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!loading) toggleFavorite(paperId, { server_url: server, title, authors, year });
        }}
        aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
        sx={{ color: favorited ? "#800000" : "text.secondary", opacity: loading ? 0.4 : 1 }}
      >
        {favorited ? (
          <FavoriteIcon fontSize={size} />
        ) : (
          <FavoriteBorderIcon fontSize={size} />
        )}
      </IconButton>
    </Tooltip>
  );
};

export default FavoriteButton;
