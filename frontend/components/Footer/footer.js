import { Box, Typography } from "@material-ui/core"
import Link from "next/link"

const Footer = () => {

    const style = {
        upper: {
            backgroundColor: "#2c3e50"
        },
        lower: {
            backgroundColor: "#1a252f"
        }
    }

    return (
        <Box display="flex" flexDirection="column">
            <Box display="flex" flexDirection="row" alignItems="center" justifyContent="space-evenly" style={style.upper} p={4}>

                <Link href="/">
                    <img src="/images/MICCoMLogo.png" height="48px" alt="Miccom Logo"></img>
                </Link>
                <Link href="/">
                    <img src="/images/ArgonneLogo.png" height="48px" alt="Argonne National Lab Logo"></img>
                </Link>
                <Link href="/">
                    <img src="/images/UchicagoLogo.png" height="48px" alt="University of Chicago Logo"></img>
                </Link>
            </Box>
            <Box display="flex" flexDirection="row" alignItems="center" justifyContent="center" style={style.lower} p={1}>
                <Typography variant="overline" color="secondary">Copyright ©2018-2020 All Rights Reserved</Typography>
            </Box>

        </Box>
    )
}

export default Footer