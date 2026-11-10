import { useState, useEffect, useContext, useCallback } from "react";
import axios from "axios";

import FavoritesContext from "./favoritesContext";
import AuthContext from "../Auth/authContext";

const FavoritesState = ({ children }) => {
  const { authenticated } = useContext(AuthContext);
  const [favorites, setFavorites] = useState(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authenticated) {
      setFavorites(new Set());
      return;
    }
    let cancelled = false;
    setLoading(true);
    axios
      .get("/api/account/favorites")
      .then((res) => {
        if (cancelled) return;
        const ids = (res.data.favorites || []).map((p) => p.id);
        setFavorites(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setFavorites(new Set());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  const isFavorite = useCallback(
    (paperId) => favorites.has(String(paperId)),
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (paperId, meta = {}) => {
      const id = String(paperId);
      const wasFavorited = favorites.has(id);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFavorited) next.delete(id);
        else next.add(id);
        return next;
      });
      try {
        if (wasFavorited) {
          await axios.delete(`/api/account/favorites/${encodeURIComponent(id)}`);
        } else {
          await axios.post("/api/account/favorites", {
            paper_id: id,
            server_url: meta.server_url || "",
            title: meta.title || "",
            authors: meta.authors || "",
            year: meta.year || null,
          });
        }
      } catch {
        setFavorites((prev) => {
          const next = new Set(prev);
          if (wasFavorited) next.add(id);
          else next.delete(id);
          return next;
        });
      }
    },
    [favorites]
  );

  // Always-delete variant for the account page "Remove" button: avoids the
  // toggle direction being wrong when the favorites Set is stale.
  const removeFavorite = useCallback(async (paperId) => {
    const id = String(paperId);
    setFavorites((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await axios.delete(`/api/account/favorites/${encodeURIComponent(id)}`);
    } catch {
      setFavorites((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  }, []);

  return (
    <FavoritesContext.Provider value={{ favorites, loading, isFavorite, toggleFavorite, removeFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export default FavoritesState;
