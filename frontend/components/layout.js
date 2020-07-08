import Header from "../components/Header/header"
import Footer from "../components/Footer/footer"
import { Box } from "@material-ui/core"

function Layout({ children }) {

    return (
        <Box display="flex" flexDirection="column" flexGrow={1}>
            <Header />
            <Box display="flex" flexGrow={1}>
                {children}
            </Box>
            <Footer />
        </Box>
    )
}

export default Layout