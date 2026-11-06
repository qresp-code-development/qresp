import { useContext, useState } from "react";

import {
  Alert,
  Box,
  CircularProgress,
  Container,
  Link as MuiLink,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";

import SEO from "../components/seo";
import { RegularStyledButton } from "../components/button";
import AuthContext from "../Context/Auth/authContext";

// Opened from the confirmation email sent at email/password sign-up. The
// token alone is not enough: the backend also wants the account's password,
// so someone who registered another person's address cannot have them
// activate it by clicking the link.
const VerifyEmailPage = () => {
  const router = useRouter();
  const { verifyEmail } = useContext(AuthContext);
  const token = (router && router.query && router.query.token) || "";

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await verifyEmail(token, password);
    setSubmitting(false);
    if (result.ok) {
      router.replace("/account");
    } else {
      setError(result.error);
    }
  };

  return (
    <Container maxWidth="sm">
      <SEO title="Confirm your email" />
      <Box sx={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", py: 6 }}>
        <Paper elevation={6} sx={{ width: "100%", maxWidth: 420, borderRadius: 3, p: { xs: 3, sm: 4 } }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700, color: "#800000", mb: 2, textAlign: "center" }}>
            Confirm your email
          </Typography>

          {!token ? (
            <Alert severity="error">
              This confirmation link is incomplete. Open the link from the email
              again, or <MuiLink href="/login">sign in</MuiLink> to get a new one.
            </Alert>
          ) : (
            <Box component="form" onSubmit={handleSubmit} noValidate>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Enter the password you chose when you created your account to
                finish signing up.
              </Typography>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              <TextField
                label="Password"
                type="password"
                fullWidth
                required
                size="small"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                sx={{ mb: 2 }}
                autoComplete="current-password"
              />
              <RegularStyledButton
                type="submit"
                fullWidth
                disabled={submitting || !password}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {submitting ? "Confirming…" : "Confirm email"}
              </RegularStyledButton>
            </Box>
          )}
        </Paper>
      </Box>
    </Container>
  );
};

export default VerifyEmailPage;
