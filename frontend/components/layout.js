import Header from "../components/Header/header"
import Footer from "../components/Footer/footer"
import { Fragment } from "react"


function Layout({ children }) {

    return (
        <Fragment>
            <Header />
            {children}
            <Footer />
        </Fragment>
    )
}

export default Layout