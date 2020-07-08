import { AppBar, Toolbar, Button, Box } from "@material-ui/core"

const Header = () => {
    return (
        <AppBar position="sticky" color="primary">
            <Toolbar>
                <Box display="flex" flexDirection="row" p={1} flexGrow={1} >
                    <Box flexGrow={1} p={1}>
                        Qresp
                    </Box>
                    <Box display="flex">
                        <Box m={1}>
                            <Button variant="contained" m={1} size="large">Explorer</Button>
                        </Box>
                        <Box m={1}>
                            <Button variant="contained" m={1} size="large">Explorer</Button>
                        </Box>
                        <Box m={1}>
                            <Button variant="contained" m={1} size="large">Explorer</Button></Box>
                    </Box>
                </Box>


            </Toolbar>
        </AppBar>
    )
}

export default Header