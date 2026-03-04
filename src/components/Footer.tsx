import { m } from "../paraglide/messages";
import PrivacyPolicy from "./PrivacyPolicy";

const Footer = () => {
    const currentYear = new Date().getFullYear();

    return (
        <footer
            className="site-footer"
        >
            <div className="container">
                <div className="row align-items-center">
                    <div className="col-md-6 mb-3 mb-md-0 text-center text-md-start">
                        <p className="mb-0">
                            &copy; {currentYear} {m.festival_name()}. {m.footer_rights()}
                        </p>
                    </div>
                    <div className="col-md-6 text-center text-md-end">
                        <PrivacyPolicy />
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
