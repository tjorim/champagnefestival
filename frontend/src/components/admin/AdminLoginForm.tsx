import { HistoryIcon, ShieldIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertHeading } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { m } from "@/paraglide/messages";
import { clearSignOutReason, peekSignOutReason } from "@/utils/signOutReason";

export default function AdminLoginForm() {
  const auth = useAuth();
  // Snapshot on mount, then clear from an effect so the notice shows for this
  // landing only — not again after a later deliberate sign-out.
  const [signOutReason] = useState(peekSignOutReason);

  useEffect(() => {
    clearSignOutReason();
  }, []);

  return (
    <div className="site-container tw:mx-auto tw:w-full">
      <h2 id="admin-title" className="tw:text-center tw:mb-6 tw:text-highlight">
        <Icon icon={ShieldIcon} className="tw:me-2" />
        {m.admin_title()}
      </h2>
      <div className="tw:flex tw:flex-wrap tw:-mx-3 tw:*:w-full tw:*:px-column-gutter tw:justify-center">
        <div className="tw:w-full tw:site-sm:w-8/12 tw:site-md:w-6/12 tw:site-lg:w-4/12 tw:text-center">
          {signOutReason === "session-expired" && !auth.authError ? (
            <Alert variant="info">
              <Icon icon={HistoryIcon} className="tw:me-2" />
              {m.auth_session_expired_notice()}
            </Alert>
          ) : null}
          {auth.authError ? (
            <Alert variant="danger" onClose={auth.clearAuthError}>
              <AlertHeading as="h3" className="tw:text-base tw:font-medium tw:leading-tight">
                {m.auth_error_title()}
              </AlertHeading>
              <p className="tw:mb-0">{auth.authError}</p>
            </Alert>
          ) : null}
          <Button variant="warning" onClick={() => auth.login()} disabled={auth.isSigningIn}>
            {auth.isSigningIn ? (
              <>
                <Spinner size="sm" className="tw:me-2" aria-hidden="true" />
                {m.auth_signing_in()}
              </>
            ) : (
              m.admin_login_button()
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
