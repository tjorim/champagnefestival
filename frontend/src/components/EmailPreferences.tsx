import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PublicCheck, PublicDescription } from "@/components/PublicFields";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { emailConsentErrorMessage } from "@/utils/emailConsentErrors";
import { getEmailPreferences, updateEmailPreferences } from "@/utils/emailConsentApi";

/**
 * Per-category email consent for the signed-in person (#1408). The backend lists only the
 * categories the roles behind the verified address allow, and consent is recorded here and nowhere
 * else (no confirmation step: the person is already signed in with that address).
 */
export default function EmailPreferences({
  getAccessToken,
}: {
  getAccessToken: () => string | null | undefined;
}) {
  const locale = getLocale();
  const queryClient = useQueryClient();
  const queryKey = ["me-email-preferences", locale] as const;
  const query = useQuery({
    queryKey,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => getEmailPreferences(getAccessToken(), locale, signal),
  });
  /** Only the boxes the person changed; everything else follows the server. */
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (changes: Record<string, boolean>) =>
      updateEmailPreferences(getAccessToken(), changes, locale),
    retry: false,
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKey, preferences);
      setDraft({});
      setSaved(true);
    },
  });

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 text-subtle">
        <Spinner label={m.loading()} size="sm" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <Alert variant="danger">
        {emailConsentErrorMessage(query.error, m.email_preferences_load_error())}
      </Alert>
    );
  }

  const { email, categories } = query.data;
  const changes: Record<string, boolean> = {};
  for (const category of categories) {
    const wanted = draft[category.key];
    if (wanted !== undefined && wanted !== category.consented) changes[category.key] = wanted;
  }
  const dirty = Object.keys(changes).length > 0;

  return (
    <Alert variant="secondary">
      <h3 className="text-base font-medium leading-tight">{m.email_preferences_title()}</h3>
      {email === null ? (
        <p className="text-sm mb-0">{m.email_preferences_no_email()}</p>
      ) : categories.length === 0 ? (
        <p className="text-sm mb-0">{m.email_preferences_none({ email })}</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty) save.mutate(changes);
          }}
        >
          <p className="text-sm mb-4">{m.email_preferences_intro({ email })}</p>
          <div className="flex flex-col gap-4 mb-4">
            {categories.map((category) => (
              <div key={category.key}>
                <PublicCheck
                  id={`email-preference-${category.key}`}
                  label={category.name}
                  checked={draft[category.key] ?? category.consented}
                  aria-describedby={`email-preference-${category.key}-description`}
                  onCheckedChange={(checked) => {
                    setSaved(false);
                    setDraft((previous) => ({ ...previous, [category.key]: checked }));
                  }}
                />
                <PublicDescription id={`email-preference-${category.key}-description`}>
                  {category.description}
                  {category.automatic && ` ${m.email_preferences_automatic()}`}
                </PublicDescription>
              </div>
            ))}
          </div>
          {save.isError && (
            <Alert variant="danger" className="py-2 text-sm">
              {emailConsentErrorMessage(save.error, m.email_preferences_save_error())}
            </Alert>
          )}
          {saved && !dirty && (
            <Alert variant="success" className="py-2 text-sm mb-4" role="status">
              {m.email_preferences_saved()}
            </Alert>
          )}
          <Button
            type="submit"
            variant="outline-primary"
            size="sm"
            disabled={!dirty || save.isPending}
          >
            {m.email_preferences_save()}
          </Button>
        </form>
      )}
    </Alert>
  );
}
