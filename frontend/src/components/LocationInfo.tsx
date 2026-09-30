import React from "react";
import Card from "react-bootstrap/Card";
import { m } from "@/paraglide/messages";
import { contactConfig } from "@/config/contact";

type Location = typeof contactConfig.location;

interface LocationInfoProps {
  location: Location;
}

/**
 * Component to display venue location information.
 *
 * Public pages should pass the active edition venue from the API. The config
 * fallback only exists for isolated renders/tests.
 */
const LocationInfo: React.FC<LocationInfoProps> = ({ location }) => {
  return (
    <Card className="border-0 shadow-sm">
      <Card.Body className="tw:p-6">
        <h3 className="tw:mb-4">{location.venueName}</h3>
        <div className="tw:flex tw:flex-wrap tw:-mx-3 tw:*:w-full tw:*:px-column-gutter">
          <div className="tw:w-full tw:site-md:w-6/12 tw:mb-4 tw:site-md:mb-0">
            <div className="tw:mb-6">
              <h5>{m.location_address()}</h5>
              <p className="tw:mb-1">{location.address}</p>
              <p className="tw:mb-1">
                {location.postalCode} {location.city}
              </p>
              <p>{m.location_country()}</p>
            </div>
          </div>
          <div className="tw:w-full tw:site-md:w-6/12">
            <div>
              <h5>{m.location_opening_hours()}</h5>
              <p>{m.location_opening_hours_value()}</p>
            </div>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
};

export default LocationInfo;
