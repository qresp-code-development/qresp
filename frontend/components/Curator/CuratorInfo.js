import Drawer from "../drawer";

import { Typography, TextField, Grid } from "@material-ui/core";

const CuratorInfo = () => {
  const onSubmit = (e) => {
    e.preventDefault();
    alert("abcd");
  };

  return (
    <Drawer heading="Who is Curating the paper" defaultOpen={true}>
      <form onSubmit={onSubmit}>
        <Grid container direction="column" spacing={1}>
          <Grid item>
            <Typography variant="h6" color="secondary">
              Name
            </Typography>
            <Grid container direction="row" spacing={2} justify="space-between">
              <Grid item xs={3}>
                <TextField fullWidth variant="outlined" size="small" />
              </Grid>
              <Grid item xs={3}>
                <TextField fullWidth variant="outlined" size="small" />
              </Grid>
              <Grid item xs={3}>
                <TextField fullWidth variant="outlined" size="small" />
              </Grid>
            </Grid>
          </Grid>
          <Grid item>
            <Typography variant="h6" color="secondary">
              Email
            </Typography>
            <TextField fullWidth variant="outlined" size="small" />
          </Grid>
          <Grid item>
            <Typography variant="h6" color="secondary">
              Affiliation
            </Typography>
            <TextField fullWidth variant="outlined" size="small" />
          </Grid>
        </Grid>
      </form>
    </Drawer>
  );
};

export default CuratorInfo;
