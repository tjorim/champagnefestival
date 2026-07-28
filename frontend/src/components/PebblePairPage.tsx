import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Config webview opened from the Pebble phone app (Pebble.openURL, triggered by
 * the watchapp's "showConfiguration" event — see pebble/src/pkjs/index.js).
 * Signs the visitor in via the existing OIDC flow, then hands the access token
 * back to the watch app by closing with a `pebblejs://close#...` URL, which is
 * how classic Pebble app configuration screens return data (see
 * https://developer.repebble.com/guides/user-interfaces/app-configuration/).
 *
 * Requires this route's origin to be an allowed OIDC redirect URI for the
 * "champagnefestival" client — that's provisioned in the separate infra stack,
 * not this repo. See pebble/README.md.
 */
export default function PebblePairPage() {
  const { isAuthenticated, isLoading, login, getAccessToken, authError } = useAuth();
  const [closed, setClosed] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [pairAttempt, setPairAttempt] = useState(0);
  const loginRequested = useRef(false);
  const pairRequested = useRef(false);

  useEffect(() => {
    if (isLoading || isAuthenticated || authError || loginRequested.current) return;
    loginRequested.current = true;
    login("/pebble-pair");
  }, [isLoading, isAuthenticated, authError, login]);

  useEffect(() => {
    if (!isAuthenticated || closed || pairRequested.current) return;
    const accessToken = getAccessToken();
    if (!accessToken) return;
    pairRequested.current = true;

    const pair = async () => {
      try {
        const response = await fetch("/api/me/pebble-token", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error(`Pairing failed (${response.status})`);
        const result = (await response.json()) as { token?: string };
        if (!result.token) throw new Error("Pairing response did not include a token");
        const payload = encodeURIComponent(JSON.stringify({ accessToken: result.token }));
        window.location.href = `pebblejs://close#${payload}`;
        setClosed(true);
      } catch (error) {
        pairRequested.current = false;
        setPairingError(error instanceof Error ? error.message : String(error));
      }
    };
    void pair();
  }, [isAuthenticated, closed, getAccessToken, pairAttempt]);

  const retryPairing = () => {
    setPairingError("");
    setPairAttempt((attempt) => attempt + 1);
  };

  return (
    <Container className="py-5 text-center">
      <h1 className="h4 mb-3">{m.pebble_pair_title()}</h1>
      <p className="text-secondary mb-4">{m.pebble_pair_description()}</p>

      {authError || pairingError ? (
        <Alert variant="danger">
          <div>{pairingError || m.pebble_pair_error()}</div>
          {!authError && pairingError ? (
            <Button className="mt-3" variant="outline-danger" size="sm" onClick={retryPairing}>
              {m.pebble_pair_retry()}
            </Button>
          ) : null}
        </Alert>
      ) : closed ? (
        <Alert variant="success">{m.pebble_pair_close_instruction()}</Alert>
      ) : (
        <div className="d-flex align-items-center justify-content-center gap-2 text-secondary">
          <Spinner animation="border" size="sm" />
          {m.pebble_pair_connecting()}
        </div>
      )}
    </Container>
  );
}
