import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { hasApiErrorCode } from "@/utils/apiErrors";
import { emailConsentErrorMessage } from "@/utils/emailConsentErrors";
import { confirmEmailConsent } from "@/utils/emailConsentApi";

/**
 * Target of the confirmation link emailed after the registration form's updates option (#1408).
 * The consent is activated by a deliberate click, not on load, so a mail client or scanner that
 * opens the link cannot confirm for the recipient. The single-use token leaves the address bar
 * as soon as the page is shown.
 */
export default function EmailConsentConfirmPage() {
  const { token: rawToken } = useSearch({ from: "/email-consent" });
  const navigate = useNavigate({ from: "/email-consent" });
  const [token] = useState(() => rawToken?.trim() ?? "");
  useEffect(() => {
    void navigate({ search: {}, replace: true });
  }, [navigate]);
  const confirm = useMutation({
    mutationFn: () => confirmEmailConsent(token, getLocale()),
    retry: false,
  });
  const linkInvalid = hasApiErrorCode(confirm.error, "consent_confirmation_invalid");

  return (
    <div className="site-container mx-auto w-full max-w-account py-12">
      <h1 className="text-2xl font-medium leading-tight mb-6 text-center">
        {m.email_consent_confirm_title()}
      </h1>
      {confirm.isSuccess ? (
        <Alert variant="success" role="status">
          {m.email_consent_confirm_done({ category: confirm.data.categoryName })}
        </Alert>
      ) : !token ? (
        <Alert variant="danger">{m.email_consent_confirm_missing()}</Alert>
      ) : (
        <>
          <p className="text-center">{m.email_consent_confirm_intro()}</p>
          {confirm.isError && (
            <Alert variant="danger" role="alert">
              {emailConsentErrorMessage(confirm.error, m.email_consent_confirm_error())}
            </Alert>
          )}
          {!linkInvalid && (
            <div className="flex justify-center">
              <Button
                variant="default"
                disabled={confirm.isPending}
                onClick={() => confirm.mutate()}
              >
                {confirm.isPending ? <Spinner size="sm" label={m.loading()} /> : null}
                {m.email_consent_confirm_button()}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
