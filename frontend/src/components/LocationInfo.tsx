import React from "react";
import { Card, Row, Col } from "react-bootstrap";
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
      <Card.Body className="p-4">
        <h3 className="mb-3">{location.venueName}</h3>
        <Row>
          <Col md={6} className="mb-3 mb-md-0">
            <div className="mb-4">
              <h5>{m.location_address()}</h5>
              <p className="mb-1">{location.address}</p>
              <p className="mb-1">
                {location.postalCode} {location.city}
              </p>
              <p>{m.location_country()}</p>
            </div>
          </Col>
          <Col md={6}>
            <div>
              <h5>{m.location_opening_hours()}</h5>
              <p>{m.location_opening_hours_value()}</p>
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

export default LocationInfo;
