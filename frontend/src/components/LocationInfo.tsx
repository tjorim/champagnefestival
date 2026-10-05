import React from "react";
import { Card, CardContent } from "@/components/ui/card";
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
      <CardContent className="p-6">
        <h3 className="mb-4">{location.venueName}</h3>
        <div className="flex flex-wrap -mx-3 *:w-full *:px-column-gutter">
          <div className="w-full site-md:w-6/12 mb-4 site-md:mb-0">
            <div className="mb-6">
              <h5>{m.location_address()}</h5>
              <p className="mb-1">{location.address}</p>
              <p className="mb-1">
                {location.postalCode} {location.city}
              </p>
              <p>{m.location_country()}</p>
            </div>
          </div>
          <div className="w-full site-md:w-6/12">
            <div>
              <h5>{m.location_opening_hours()}</h5>
              <p>{m.location_opening_hours_value()}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LocationInfo;
