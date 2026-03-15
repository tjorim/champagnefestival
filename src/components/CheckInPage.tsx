import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Container from "react-bootstrap/Container";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import ListGroup from "react-bootstrap/ListGroup";
import { m } from "../paraglide/messages";
import type { Reservation } from "../types/reservation";

export default function CheckInPage() {
  const [searchParams] = useSearchParams();
  const reservationId = searchParams.get("id") ?? undefined;
  const checkInToken = searchParams.get("token") ?? undefined;
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);

  const lookUpReservation = useCallback(async () => {
    if (!reservationId || !checkInToken) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/check-in/${encodeURIComponent(reservationId)}?token=${encodeURIComponent(checkInToken)}`,
      );

      if (response.status === 404) {
        setError(m.checkin_not_found());
      } else if (response.status === 403) {
        setError(m.checkin_invalid_token());
      } else if (response.ok) {
        const data = await response.json();
        const res = data.reservation as Reservation;
        setReservation(res);
        if (res.checkedIn) {
          setAlreadyCheckedIn(true);
        }
      } else {
        setError(m.checkin_error());
      }
    } catch {
      setError(m.checkin_error());
    } finally {
      setIsLoading(false);
    }
  }, [reservationId, checkInToken]);

  useEffect(() => {
    lookUpReservation();
  }, [lookUpReservation]);

  const handleCheckIn = useCallback(async () => {
    if (!reservationId || !checkInToken) return;

    setIsCheckingIn(true);
    setError("");

    try {
      const response = await fetch(`/api/check-in/${encodeURIComponent(reservationId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: checkInToken, issueStrap: true }),
      });

      if (response.status === 403) {
        setError(m.checkin_invalid_token());
      } else if (response.ok) {
        const data = await response.json();
        setReservation(data.reservation as Reservation);
        setSuccess(true);
        setAlreadyCheckedIn(data.alreadyCheckedIn);
      } else {
        setError(m.checkin_error());
      }
    } catch {
      setError(m.checkin_error());
    } finally {
      setIsCheckingIn(false);
    }
  }, [reservationId, checkInToken]);

  if (!reservationId || !checkInToken) {
    return (
      <section id="check-in" className="py-5" aria-labelledby="checkin-title">
        <Container>
          <h2 id="checkin-title" className="text-center mb-4 text-warning">
            <i className="bi bi-qr-code-scan me-2" aria-hidden="true" />
            {m.checkin_title()}
          </h2>
          <div className="row justify-content-center">
            <div className="col-12 col-sm-8 col-md-6">
              <Alert variant="warning" className="text-center">
                <i className="bi bi-info-circle me-2" aria-hidden="true" />
                {m.checkin_scan_prompt()}
              </Alert>
            </div>
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section id="check-in" className="py-5" aria-labelledby="checkin-title">
      <Container>
        <h2 id="checkin-title" className="text-center mb-4 text-warning">
          <i className="bi bi-qr-code-scan me-2" aria-hidden="true" />
          {m.checkin_title()}
        </h2>

        <div className="row justify-content-center">
          <div className="col-12 col-sm-10 col-md-8 col-lg-6">
            {isLoading && (
              <div className="text-center py-4">
                <Spinner animation="border" variant="warning" role="status">
                  <span className="visually-hidden">{m.checkin_looking_up()}</span>
                </Spinner>
                <p className="mt-2 text-secondary">{m.checkin_looking_up()}</p>
              </div>
            )}

            {error && (
              <Alert variant="danger">
                <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                {error}
              </Alert>
            )}

            {reservation && !isLoading && (
              <Card bg="dark" text="white" border={success ? "success" : alreadyCheckedIn ? "warning" : "secondary"}>
                <Card.Header className={`d-flex align-items-center justify-content-between ${success ? "border-success" : alreadyCheckedIn ? "border-warning" : "border-secondary"}`}>
                  <span className="fw-semibold fs-5">
                    <i className="bi bi-person-fill me-2" aria-hidden="true" />
                    {reservation.name}
                  </span>
                  <div className="d-flex gap-2 flex-wrap">
                    {reservation.checkedIn && (
                      <Badge bg="success">
                        <i className="bi bi-check-circle-fill me-1" aria-hidden="true" />
                        {m.admin_checked_in()}
                      </Badge>
                    )}
                    {reservation.strapIssued && (
                      <Badge bg="info">
                        <i className="bi bi-person-badge-fill me-1" aria-hidden="true" />
                        {m.admin_strap_issued()}
                      </Badge>
                    )}
                  </div>
                </Card.Header>

                <Card.Body>
                  {success && (
                    <Alert variant="success" className="mb-3">
                      <i className="bi bi-check-circle-fill me-2" aria-hidden="true" />
                      <strong>{m.checkin_success()}</strong>
                      <div className="mt-1">{m.checkin_strap_issued()}</div>
                    </Alert>
                  )}

                  {alreadyCheckedIn && !success && reservation.checkedInAt && (
                    <Alert variant="warning" className="mb-3">
                      <i className="bi bi-exclamation-circle-fill me-2" aria-hidden="true" />
                      {m.checkin_already_in()} {new Date(reservation.checkedInAt).toLocaleTimeString()}
                    </Alert>
                  )}

                  <ListGroup variant="flush" className="bg-dark">
                    <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
                      <span className="text-secondary">{m.checkin_event()}</span>
                      <span>{reservation.eventTitle || reservation.eventId}</span>
                    </ListGroup.Item>
                    <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
                      <span className="text-secondary">{m.checkin_guests()}</span>
                      <span>{reservation.guestCount}</span>
                    </ListGroup.Item>
                  </ListGroup>

                  {reservation.preOrders.length > 0 && (
                    <div className="mt-3">
                      <p className="fw-semibold text-warning mb-2">
                        <i className="bi bi-cart-fill me-2" aria-hidden="true" />
                        {m.checkin_pre_orders()}
                      </p>
                      <ListGroup variant="flush">
                        {reservation.preOrders.map((item) => (
                          <ListGroup.Item
                            key={item.productId}
                            className="bg-dark text-light border-secondary d-flex justify-content-between align-items-center"
                          >
                            <span>
                              {item.name}{" "}
                              <Badge bg="secondary">×{item.quantity}</Badge>
                            </span>
                            {item.delivered ? (
                              <Badge bg="success">
                                <i className="bi bi-check-lg me-1" aria-hidden="true" />
                                {m.admin_bottle_delivered()}
                              </Badge>
                            ) : (
                              <Badge bg="secondary">{m.admin_bottle_not_delivered()}</Badge>
                            )}
                          </ListGroup.Item>
                        ))}
                      </ListGroup>
                    </div>
                  )}
                </Card.Body>

                {!reservation.checkedIn && (
                  <Card.Footer className="bg-dark border-secondary">
                    <Button
                      variant="warning"
                      className="w-100"
                      onClick={handleCheckIn}
                      disabled={isCheckingIn}
                    >
                      {isCheckingIn ? (
                        <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                      ) : (
                        <i className="bi bi-person-check-fill me-2" aria-hidden="true" />
                      )}
                      {m.checkin_do_checkin()}
                    </Button>
                  </Card.Footer>
                )}
              </Card>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
