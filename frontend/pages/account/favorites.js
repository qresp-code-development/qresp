import { Fragment, useContext, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Typography,
} from "@mui/material";
import { Favorite, FavoriteBorder } from "@mui/icons-material";

import SEO from "../../components/seo";
import AccountLayout from "../../components/Account/AccountLayout";
import AuthContext from "../../Context/Auth/authContext";
import FavoritesContext from "../../Context/Favorites/favoritesContext";
import { getServer } from "../../Utils/utils";

const getHostname = (url) => {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const FavoritesPage = () => {
  const { loading, authenticated } = useContext(AuthContext);
  const { removeFavorite } = useContext(FavoritesContext);
  const [favoritePapers, setFavoritePapers] = useState(null);
  const origin = typeof window === "undefined" ? "" : getServer();

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    axios
      .get("/api/account/favorites")
      .then((res) => {
        if (!cancelled) setFavoritePapers(res.data.favorites || []);
      })
      .catch(() => {
        if (!cancelled) setFavoritePapers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  let content;

  if (loading) {
    content = (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <CircularProgress size={20} />
        <Typography color="text.secondary">Checking sign-in…</Typography>
      </Box>
    );
  } else if (!authenticated) {
    content = (
      <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, maxWidth: 440 }}>
        <Typography variant="h6" gutterBottom>
          Please sign in.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Use &ldquo;Sign in&rdquo; in the header to access your saved papers.
        </Typography>
      </Paper>
    );
  } else if (favoritePapers === null) {
    content = (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <CircularProgress size={20} />
        <Typography color="text.secondary">Loading favorites…</Typography>
      </Box>
    );
  } else if (favoritePapers.length === 0) {
    content = (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          py: 8,
          gap: 1.5,
        }}
      >
        <FavoriteBorder sx={{ fontSize: 56, color: "text.disabled" }} />
        <Typography variant="h6" color="text.secondary">
          No favorites yet.
        </Typography>
        <Typography variant="body2" color="text.disabled" textAlign="center">
          Click the heart on any paper to save it here.
        </Typography>
      </Box>
    );
  } else {
    content = (
      <Fragment>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Favorite sx={{ fontSize: 20, color: "#800000" }} />
          <Typography variant="h6" fontWeight={700}>
            Saved Papers
          </Typography>
          <Chip
            label={favoritePapers.length}
            size="small"
            sx={{ ml: 0.5, bgcolor: "#800000", color: "#fff", fontWeight: 700 }}
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {favoritePapers.map((paper) => {
            const serverLabel = getHostname(paper.server_url);
            const viewHref = `/paperdetails/${encodeURIComponent(paper.id)}?server=${encodeURIComponent(paper.server_url || origin)}`;

            return (
              <Paper
                key={paper.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  borderLeft: "3px solid #800000",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.5,
                  flexWrap: "wrap",
                }}
              >
                {/* Heart icon */}
                <Box sx={{ pt: 0.25, flexShrink: 0 }}>
                  <Favorite sx={{ fontSize: 18, color: "#800000" }} />
                </Box>

                {/* Main content */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={700} noWrap>
                    {paper.title}
                    {paper.year ? (
                      <Typography
                        component="span"
                        fontWeight={400}
                        color="text.secondary"
                        sx={{ ml: 0.75 }}
                      >
                        ({paper.year})
                      </Typography>
                    ) : null}
                  </Typography>

                  {paper.authors ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      noWrap
                      sx={{ mt: 0.25 }}
                    >
                      {paper.authors}
                    </Typography>
                  ) : null}

                  {serverLabel ? (
                    <Chip
                      label={serverLabel}
                      size="small"
                      variant="outlined"
                      sx={{ mt: 0.75, fontSize: "0.7rem", height: 20 }}
                    />
                  ) : null}
                </Box>

                {/* Actions */}
                <Box sx={{ display: "flex", gap: 1, flexShrink: 0, mt: 0.25 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    component={Link}
                    href={viewHref}
                  >
                    View
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      removeFavorite(paper.id);
                      setFavoritePapers((items) =>
                        (items || []).filter((p) => p.id !== paper.id)
                      );
                    }}
                  >
                    Remove
                  </Button>
                </Box>
              </Paper>
            );
          })}
        </Box>
      </Fragment>
    );
  }

  return (
    <Fragment>
      <SEO
        title="Qresp | My Favorites"
        description="Your saved papers on Qresp"
        author="Qresp Team"
      />
      <AccountLayout pageTitle="My Favorites">{content}</AccountLayout>
    </Fragment>
  );
};

export default FavoritesPage;
