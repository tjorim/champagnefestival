import { Link } from "@tanstack/react-router";
import { m } from "@/paraglide/messages";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-md-6 mb-3 mb-md-0 text-center text-md-start">
            <p className="mb-0">
              &copy; {currentYear} {m.festival_name()}. {m.footer_rights()}
            </p>
          </div>
          <div className="col-md-6 text-center text-md-end">
            <Link to="/privacy" className="text-white text-decoration-none footer-link">
              {m.footer_privacy()}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
