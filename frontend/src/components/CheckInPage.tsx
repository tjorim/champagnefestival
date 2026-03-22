import clsx from "clsx";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { useSearchParams } from "react-router";
import Container from "react-bootstrap/Container";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import ListGroup from "react-bootstrap/ListGroup";
import { m } from "@/paraglide/messages";
import { queryKeys } from "@/utils/queryKeys";
import {
  CheckInError,
  fetchCheckInRegistration,
  submitCheckIn,
} from "@/utils/publicRegistrationApi";

export default function CheckInPage() {
  const [searchParams] = useSearchParams();
  const registrationId = searchParams.get("id") ?? undefined;
  const checkInToken = searchParams.get("token") ?? undefined;
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);

  const registrationQuery = useQuery({
    queryKey: queryKeys.checkInRegistration(registrationId ?? "", checkInToken ?? ""),
    queryFn: () => fetchCheckInRegistration(registrationId!, checkInToken!),
    enabled: Boolean(registrationId && checkInToken),
    retry: false,
    staleTime: 30 * 1000,
  });

  const checkInMutation = useMutation({
    mutationFn: () => submitCheckIn(registrationId!, checkInToken!),
    retry: false,
    onSuccess: ({ alreadyCheckedIn: mutationAlreadyCheckedIn }) => {
      setError("");
      setSuccess(true);
      setAlreadyCheckedIn(mutationAlreadyCheckedIn);
      registrationQuery.refetch().catch(() => undefined);
    },
  });

  const registration = checkInMutation.data?.registration ?? registrationQuery.data ?? null;
  const isLoading = registrationQuery.isPending;
  const isCheckingIn = checkInMutation.isPending;
  const queryError = registrationQuery.isError ? registrationQuery.error.message : "";
  const isAlreadyCheckedIn = success ? alreadyCheckedIn : (registration?.checkedIn ?? false);

  const handleCheckIn = useCallback(async () => {
    if (!registrationId || !checkInToken) return;

    setError("");

    try {
      const result = await checkInMutation.mutateAsync();
      setAlreadyCheckedIn(result.alreadyCheckedIn || result.registration.checkedIn);
    } catch (mutationError) {
      setError(
        mutationError instanceof CheckInError ? mutationError.message : m.checkin_error(),
      );
    }
  }, [checkInMutation, checkInToken, registrationId]);

  if (!registrationId || !checkInToken) {
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

            {(error || queryError) && (
              <Alert variant="danger">
                <i className="bi bi-exclamation-triangle-fill me-2" aria-hidden="true" />
                {error || queryError}
              </Alert>
            )}

            {registration && !isLoading && (
              <Card
                bg="dark"
                text="white"
                border={success ? "success" : isAlreadyCheckedIn ? "warning" : "secondary"}
              >
                <Card.Header
                  className={clsx(
                    "d-flex align-items-center justify-content-between",
                    success
                      ? "border-success"
                      : isAlreadyCheckedIn
                        ? "border-warning"
                        : "border-secondary",
                  )}
                >
                  <span className="fw-semibold fs-5">
                    <i className="bi bi-person-fill me-2" aria-hidden="true" />
                    {registration.name}
                  </span>
                  <div className="d-flex gap-2 flex-wrap">
                    {registration.checkedIn && (
                      <Badge bg="success">
                        <i className="bi bi-check-circle-fill me-1" aria-hidden="true" />
                        {m.admin_checked_in()}
                      </Badge>
                    )}
                    {registration.strapIssued && (
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

                  {isAlreadyCheckedIn && !success && registration.checkedInAt && (
                    <Alert variant="warning" className="mb-3">
                      <i className="bi bi-exclamation-circle-fill me-2" aria-hidden="true" />
                      {m.checkin_already_in()}{" "}
                      {new Date(registration.checkedInAt).toLocaleTimeString()}
                    </Alert>
                  )}

                  <ListGroup variant="flush" className="bg-dark">
                    <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
                      <span className="text-secondary">{m.checkin_event()}</span>
                      <span>{registration.eventTitle || registration.eventId}</span>
                    </ListGroup.Item>
                    <ListGroup.Item className="bg-dark text-light border-secondary d-flex justify-content-between">
                      <span className="text-secondary">{m.checkin_guests()}</span>
                      <span>{registration.guestCount}</span>
                    </ListGroup.Item>
                  </ListGroup>

                  {registration.preOrders.length > 0 && (
                    <div className="mt-3">
                      <p className="fw-semibold text-warning mb-2">
                        <i className="bi bi-cart-fill me-2" aria-hidden="true" />
                        {m.checkin_pre_orders()}
                      </p>
                      <ListGroup variant="flush">
                        {registration.preOrders.map((item, idx) => (
                          <ListGroup.Item
                            key={`${item.productId}-${idx}`}
                            className="bg-dark text-light border-secondary d-flex justify-content-between align-items-center"
                          >
                            <span>
                              {item.name} <Badge bg="secondary">×{item.quantity}</Badge>
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

                {!registration.checkedIn && (
                  <Card.Footer className="bg-dark border-secondary">
                    <Button
                      variant="warning"
                      className="w-100"
                      onClick={handleCheckIn}
                      disabled={isCheckingIn}
                    >
                      {isCheckingIn ? (
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                          className="me-2"
                        />
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
