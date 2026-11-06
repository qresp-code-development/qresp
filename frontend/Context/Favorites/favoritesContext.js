import { createContext } from "react";

const FavoritesContext = createContext({
  favorites: new Set(),
  loading: false,
  isFavorite: () => false,
  toggleFavorite: async () => {},
  removeFavorite: async () => {},
});

export default FavoritesContext;
