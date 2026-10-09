import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { PublicCheck } from "@/components/PublicFields";
import { m } from "@/paraglide/messages";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { sendTestPush } from "@/utils/pushApi";

interface PushOptInProps {
  /** Credentials for admin test-send; the backend enforces the admin role. */
  authHeaders?: () => Record<string, string>;
}

/** Public opt-in/opt-out control for Web Push (#941), with explicit consent
 * copy shown *before* the browser's own permission prompt — the browser
 * prompt alone isn't consent under this project's privacy posture, matching
 * the checkbox pattern #934 already established for marketing email opt-in. */
export default function PushOptIn({ authHeaders }: PushOptInProps) {
  const { state, isSubscribed, isBusy, error, subscribe, unsubscribe } = usePushSubscription();
  const [consentChecked, setConsentChecked] = useState(false);
  // The button stays enabled so it never looks broken; pressing it without consent
  // explains what's missing instead, and still never reaches the browser prompt.
  const [consentMissing, setConsentMissing] = useState(false);
  const [testStatus, setTestStatus] = useState<"" | "sending" | "sent" | "error">("");

  if (state === "unsupported" || state === "disabled") {
    return null;
  }

  const handleSendTest = async () => {
    if (!authHeaders) return;
    setTestStatus("sending");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("not subscribed");
      // The backend resolves a subscription by its own id, not the raw
      // endpoint — re-derive it via a fresh subscribe call, which upserts
      // the existing row (app.services.push_service.subscribe) rather than
      // duplicating it, and hands back the id we need to target the test.
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
        throw new Error("incomplete subscription");
      const { subscribeToPush } = await import("@/utils/pushApi");
      const { getLocale } = await import("@/paraglide/runtime");
      const result = await subscribeToPush({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        locale: getLocale(),
      });
      await sendTestPush(result.id, authHeaders());
      setTestStatus("sent");
    } catch {
      setTestStatus("error");
    }
  };

  return (
    <Card tone="secondary">
      <CardContent>
        <CardTitle className="text-base font-medium leading-tight">
          {m.push_opt_in_title()}
        </CardTitle>
        <p className="text-sm text-subtle">{m.push_opt_in_description()}</p>

        {error && (
          <Alert variant="danger" className="text-sm py-2" role="alert">
            {m.push_opt_in_error()}
          </Alert>
        )}

        {!isSubscribed ? (
          <>
            <PublicCheck
              id="push-opt-in-consent"
              className="text-sm mb-2"
              label={m.push_opt_in_consent_label()}
              checked={consentChecked}
              onCheckedChange={(checked) => {
                setConsentChecked(checked);
                if (checked) setConsentMissing(false);
              }}
              aria-invalid={consentMissing || undefined}
              aria-describedby={consentMissing ? "push-opt-in-consent-error" : undefined}
            />
            {consentMissing && (
              <p
                id="push-opt-in-consent-error"
                className="text-sm text-destructive mb-2"
                role="alert"
              >
                {m.push_opt_in_consent_required()}
              </p>
            )}
            <Button
              variant="warning"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                if (!consentChecked) {
                  setConsentMissing(true);
                  document.getElementById("push-opt-in-consent")?.focus();
                  return;
                }
                void subscribe();
              }}
            >
              {isBusy && (
                <Spinner
                  size="sm"

                  aria-hidden="true"
                />
              )}
              {m.push_opt_in_subscribe_button()}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-success mb-2" role="status">
              {m.push_opt_in_subscribed_status()}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => void unsubscribe()}
              >
                {isBusy && (
                  <Spinner
                    size="sm"

                    aria-hidden="true"
                  />
                )}
                {m.push_opt_in_unsubscribe_button()}
              </Button>
              {authHeaders && (
                <Button
                  variant="outline-warning"
                  size="sm"
                  disabled={testStatus === "sending"}
                  onClick={() => void handleSendTest()}
                >
                  {testStatus === "sending" && (
                    <Spinner
                      size="sm"

                      aria-hidden="true"
                    />
                  )}
                  {m.push_test_send_button()}
                </Button>
              )}
            </div>
            {testStatus === "sent" && (
              <p className="text-sm text-success mt-2 mb-0" role="status">
                {m.push_test_send_success()}
              </p>
            )}
            {testStatus === "error" && (
              <p className="text-sm text-destructive mt-2 mb-0" role="alert">
                {m.push_opt_in_error()}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
