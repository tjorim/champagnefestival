import { Link } from "@tanstack/react-router";
import { m } from "@/paraglide/messages";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-container mx-auto w-full">
        <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter items-center">
          <div className="site-md:w-6/12 mb-4 site-md:mb-0 text-center site-md:text-left">
            <p className="mb-0">
              &copy; {currentYear} {m.festival_name()}. {m.footer_rights()}
            </p>
          </div>
          <div className="site-md:w-6/12 text-center site-md:text-right">
            <Link to="/privacy" className="text-inverse no-underline footer-link">
              {m.footer_privacy()}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
