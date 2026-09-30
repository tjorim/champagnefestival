import { Link } from "@tanstack/react-router";
import { m } from "@/paraglide/messages";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-container tw:mx-auto tw:w-full">
        <div className="tw:flex tw:flex-wrap tw:-mx-3 tw:*:w-full tw:*:px-column-gutter tw:items-center">
          <div className="tw:site-md:w-6/12 tw:mb-4 tw:site-md:mb-0 tw:text-center tw:site-md:text-left">
            <p className="tw:mb-0">
              &copy; {currentYear} {m.festival_name()}. {m.footer_rights()}
            </p>
          </div>
          <div className="tw:site-md:w-6/12 tw:text-center tw:site-md:text-right">
            <Link to="/privacy" className="tw:text-inverse tw:no-underline footer-link">
              {m.footer_privacy()}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
