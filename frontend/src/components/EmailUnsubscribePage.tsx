import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { hasApiErrorCode } from "@/utils/apiErrors";
import { emailConsentErrorMessage } from "@/utils/emailConsentErrors";
import { getUnsubscribeCategory, unsubscribeByToken } from "@/utils/emailUnsubscribeApi";

/**
 * Target of the unsubscribe link in member mail (#1407). Mail clients POST to the same address for
 * one-click unsubscribe; a person who opens it lands here and must click, so a scanner following
 * the link cannot unsubscribe anyone. The signed token leaves the address bar as soon as it is read.
 */
export default function EmailUnsubscribePage() {
  const { token: rawToken } = useSearch({ from: "/email-unsubscribe" });
  const navigate = useNavigate({ from: "/email-unsubscribe" });
  const [token] = useState(() => rawToken?.trim() ?? "");
  useEffect(() => {
    void navigate({ search: {}, replace: true });
  }, [navigate]);
  const category = useQuery({
    queryKey: ["email-unsubscribe", "category", token],
    queryFn: ({ signal }) => getUnsubscribeCategory(token, getLocale(), signal),
    enabled: token !== "",
    retry: false,
  });
  const unsubscribe = useMutation({ mutationFn: () => unsubscribeByToken(token), retry: false });
  const linkInvalid =
    hasApiErrorCode(category.error, "unsubscribe_token_invalid") ||
    hasApiErrorCode(unsubscribe.error, "unsubscribe_token_invalid");
  const categoryName = category.data?.categoryName ?? "";
  const failure = unsubscribe.error ?? category.error;

  return (
    <div className="site-container mx-auto w-full max-w-account py-12">
      <h1 className="text-2xl font-medium leading-tight mb-6 text-center">
        {m.email_unsubscribe_title()}
      </h1>
      {unsubscribe.isSuccess ? (
        <Alert variant="success" role="status">
          {m.email_unsubscribe_done({ category: categoryName })}
        </Alert>
      ) : !token ? (
        <Alert variant="danger">{m.email_unsubscribe_missing()}</Alert>
      ) : category.isPending ? (
        <div className="flex justify-center">
          <Spinner size="sm" label={m.loading()} />
        </div>
      ) : (
        <>
          {failure && (
            <Alert variant="danger" role="alert">
              {emailConsentErrorMessage(failure, m.email_unsubscribe_error())}
            </Alert>
          )}
          {!linkInvalid && category.isSuccess && (
            <>
              <p className="text-center">{m.email_unsubscribe_intro({ category: categoryName })}</p>
              <div className="flex justify-center">
                <Button
                  variant="default"
                  disabled={unsubscribe.isPending}
                  onClick={() => unsubscribe.mutate()}
                >
                  {unsubscribe.isPending ? <Spinner size="sm" label={m.loading()} /> : null}
                  {m.email_unsubscribe_button()}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
