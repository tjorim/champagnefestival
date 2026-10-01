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
        <CardTitle className="tw:text-base tw:font-medium tw:leading-tight">
          {m.push_opt_in_title()}
        </CardTitle>
        <p className="tw:text-sm tw:text-subtle">{m.push_opt_in_description()}</p>

        {error && (
          <Alert variant="danger" className="tw:text-sm tw:py-2" role="alert">
            {m.push_opt_in_error()}
          </Alert>
        )}

        {!isSubscribed ? (
          <>
            <PublicCheck
              id="push-opt-in-consent"
              className="tw:text-sm tw:mb-2"
              label={m.push_opt_in_consent_label()}
              checked={consentChecked}
              onCheckedChange={setConsentChecked}
            />
            <Button
              variant="warning"
              size="sm"
              disabled={!consentChecked || isBusy}
              onClick={() => void subscribe()}
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
            <p className="tw:text-sm tw:text-success tw:mb-2" role="status">
              {m.push_opt_in_subscribed_status()}
            </p>
            <div className="tw:flex tw:gap-2 tw:flex-wrap">
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
              <p className="tw:text-sm tw:text-success tw:mt-2 tw:mb-0" role="status">
                {m.push_test_send_success()}
              </p>
            )}
            {testStatus === "error" && (
              <p className="tw:text-sm tw:text-destructive tw:mt-2 tw:mb-0" role="alert">
                {m.push_opt_in_error()}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
