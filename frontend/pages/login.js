import { useContext, useEffect, useState } from "react";

import {
  Alert,
  Box,
  CircularProgress,
  Container,
  Divider,
  Link as MuiLink,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";

import SEO from "../components/seo";
import { RegularStyledButton } from "../components/button";
import AuthContext from "../Context/Auth/authContext";
import safeNext, { providerHref } from "../Utils/safeNext";

const QrespLogo = () => (
  <svg
    viewBox="-20 0 350 105"
    width="150"
    height="45"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Qresp"
    role="img"
    style={{ userSelect: "none" }}
  >
    <circle cx="40" cy="40" r="35" stroke="white" strokeWidth="8" />
    <path d="M 17 35 Q 21 18 38 17" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <path d="M 63 72 L 78 93" stroke="white" strokeWidth="10" strokeLinecap="round" fill="none" />
    <g transform="translate(92, 51) scale(1.262)">
      <rect x="-4" y="-23" width="8" height="7" rx="2" fill="none" stroke="white" strokeWidth="2.5" />
      <line x1="-5" y1="-16" x2="5" y2="-16" stroke="rgba(255,255,255,0.50)" strokeWidth="1.5" />
      <rect x="-4" y="-16" width="8" height="25" fill="none" stroke="white" strokeWidth="2.5" />
      <polygon points="-4,9 4,9 0,19" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
    </g>
    <path d="M 97 31 C 104 22 113 22 120 31" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none" />
    <text x="122" y="75" fontFamily="'Nunito', Arial, sans-serif" fontSize="104" fontWeight="200" fill="white">esp</text>
  </svg>
);

const LoginPage = () => {
  const router = useRouter();
  const { loading, authenticated, localLogin, register } = useContext(AuthContext);

  const requested = safeNext(router && router.query && router.query.next, "");
  const next = requested || "/";

  const [mode, setMode] = useState("signin"); // "signin" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Shown after sign-up, or when signing in to an account whose email is
  // not confirmed yet: { text, link } (link only on staging, no email sent).
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!loading && authenticated && router) {
      router.replace(
        requested && requested !== "/login" ? requested : "/account"
      );
    }
  }, [loading, authenticated, requested, router]);

  if (loading || authenticated) {
    return (
      <Container maxWidth="sm">
        <Typography variant="h6" color="secondary" sx={{ mt: 6 }}>
          {loading ? "Checking sign-in…" : "You are signed in — redirecting…"}
        </Typography>
      </Container>
    );
  }

  const switchMode = (newMode) => {
    setMode(newMode);
    setError("");
    setNotice(null);
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice(null);

    if (mode === "register") {
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
    }

    setSubmitting(true);
    const result =
      mode === "signin"
        ? await localLogin(email, password)
        : await register(email, password, name, affiliation);
    setSubmitting(false);

    if (result.verificationRequired) {
      const text =
        mode === "register"
          ? `We sent a confirmation link to ${result.email || email}. Open it and enter your password to finish creating your account.`
          : result.error;
      switchMode("signin");
      setNotice({ text, link: result.verifyLink });
      return;
    }

    if (result.ok) {
      router.replace(requested && requested !== "/login" ? requested : "/account");
    } else {
      setError(result.error || "Something went wrong. Please try again.");
    }
  };

  const isRegister = mode === "register";

  return (
    <Container maxWidth="sm">
      <SEO title={isRegister ? "Create account" : "Sign in"} />
      <Box
        sx={{
          minHeight: "80vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          py: 6,
        }}
      >
        <Paper
          elevation={6}
          sx={{ width: "100%", maxWidth: 420, borderRadius: 3, overflow: "hidden" }}
        >
          {/* Branded maroon header */}
          <Box
            sx={{
              backgroundColor: "#800000",
              py: 4,
              px: 3,
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <QrespLogo />
            <Typography
              variant="body2"
              sx={{ color: "rgba(255,255,255,0.75)", fontStyle: "italic", letterSpacing: "0.03em" }}
            >
              Curation and Exploration of Reproducible Scientific Papers
            </Typography>
          </Box>

          <Box sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 700, color: "#800000", mb: 2, textAlign: "center" }}>
              Sign in to Qresp
            </Typography>

            {/* Mode toggle */}
            <Box sx={{ display: "flex", borderRadius: 1, overflow: "hidden", mb: 3, border: "1px solid #800000" }}>
              <Box
                component="button"
                onClick={() => switchMode("signin")}
                sx={{
                  flex: 1,
                  py: 1,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  backgroundColor: mode === "signin" ? "#800000" : "transparent",
                  color: mode === "signin" ? "#fff" : "#800000",
                  transition: "background 0.15s",
                  "&:hover": { backgroundColor: mode === "signin" ? "#800000" : "rgba(128,0,0,0.08)" },
                }}
              >
                Sign in
              </Box>
              <Box
                component="button"
                onClick={() => switchMode("register")}
                sx={{
                  flex: 1,
                  py: 1,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  backgroundColor: mode === "register" ? "#800000" : "transparent",
                  color: mode === "register" ? "#fff" : "#800000",
                  transition: "background 0.15s",
                  "&:hover": { backgroundColor: mode === "register" ? "#800000" : "rgba(128,0,0,0.08)" },
                }}
              >
                Create account
              </Box>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {notice && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {notice.text}
                {notice.link && (
                  <>
                    {" "}
                    <MuiLink href={notice.link}>Open confirmation link</MuiLink>
                  </>
                )}
              </Alert>
            )}

            {/* Email / password form */}
            <Box component="form" onSubmit={handleSubmit} noValidate>
              {isRegister && (
                <TextField
                  label="Name (optional)"
                  type="text"
                  fullWidth
                  size="small"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  sx={{ mb: 1.5 }}
                  autoComplete="name"
                />
              )}
              {isRegister && (
                <TextField
                  label="Affiliation (optional)"
                  type="text"
                  fullWidth
                  size="small"
                  value={affiliation}
                  onChange={(e) => setAffiliation(e.target.value)}
                  placeholder="e.g. Dept. of Physics, University of Chicago"
                  sx={{ mb: 1.5 }}
                  autoComplete="organization"
                />
              )}
              <TextField
                label="Email address"
                type="email"
                fullWidth
                required
                size="small"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={{ mb: 1.5 }}
                autoComplete="email"
              />
              <TextField
                label="Password"
                type="password"
                fullWidth
                required
                size="small"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                sx={{ mb: isRegister ? 1.5 : 2 }}
                autoComplete={isRegister ? "new-password" : "current-password"}
                helperText={isRegister ? "At least 8 characters" : undefined}
              />
              {isRegister && (
                <TextField
                  label="Confirm password"
                  type="password"
                  fullWidth
                  required
                  size="small"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  sx={{ mb: 2 }}
                  autoComplete="new-password"
                />
              )}
              <RegularStyledButton
                type="submit"
                fullWidth
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {submitting
                  ? isRegister ? "Creating account…" : "Signing in…"
                  : isRegister ? "Create account with email" : "Sign in with email"}
              </RegularStyledButton>
            </Box>

            <Divider sx={{ my: 3 }}>
              <Typography variant="caption" color="text.secondary">
                or continue with
              </Typography>
            </Divider>

            {/* OAuth providers */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Box>
                <RegularStyledButton fullWidth component="a" href={providerHref("microsoft", next)}
                  startIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" width="18" height="18">
                      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                    </svg>
                  }
                >
                  Continue with Microsoft
                </RegularStyledButton>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  Use your work or school account — most institutions issue one.
                </Typography>
              </Box>
              <Box>
                <RegularStyledButton fullWidth component="a" href={providerHref("google", next)}
                  startIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18" height="18">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                      <path fill="none" d="M0 0h48v48H0z"/>
                    </svg>
                  }
                >
                  Continue with Google
                </RegularStyledButton>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  Personal or institutional Google account.
                </Typography>
              </Box>
              <Box>
                <RegularStyledButton fullWidth component="a" href={providerHref("github", next)}
                  startIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                  }
                >
                  Continue with GitHub
                </RegularStyledButton>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  Sign in with your GitHub account.
                </Typography>
              </Box>
            </Box>

            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 3, lineHeight: 1.6 }}>
              Qresp receives only your name and email address, used solely to
              attribute the records you publish. All sign-in methods that share
              the same email address access the same account.
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default LoginPage;
