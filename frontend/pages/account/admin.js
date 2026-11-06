import { useContext } from "react";
import { Box, CircularProgress, Divider, Typography } from "@mui/material";

import SEO from "../../components/seo";
import AccountLayout from "../../components/Account/AccountLayout";
import OwnerlessRecords from "../../components/Account/OwnerlessRecords";
import AllRecords from "../../components/Account/AllRecords";
import AuthContext from "../../Context/Auth/authContext";

const AdminPage = () => {
  const { loading, authenticated, user } = useContext(AuthContext);

  if (loading) {
    return (
      <AccountLayout pageTitle="Admin Tools">
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress sx={{ color: "#800000" }} />
        </Box>
      </AccountLayout>
    );
  }

  if (!authenticated || !user?.is_admin) {
    return (
      <AccountLayout pageTitle="Admin Tools">
        <Typography color="text.secondary">
          Access denied. This page is only available to administrators.
        </Typography>
      </AccountLayout>
    );
  }

  return (
    <>
      <SEO title="Qresp | Admin" />
      <AccountLayout pageTitle="Admin Tools">
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={700} mb={2}>
            Ownerless Records
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <OwnerlessRecords />
        </Box>

        <Box>
          <Typography variant="h6" fontWeight={700} mb={2}>
            All Records
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <AllRecords />
        </Box>
      </AccountLayout>
    </>
  );
};

export default AdminPage;
