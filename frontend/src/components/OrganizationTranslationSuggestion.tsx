import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { m } from "@/paraglide/messages";
import { captureAdminOrganizationsFence } from "@/state/adminOrganizationsCollection";

export default function OrganizationTranslationSuggestion({
  url,
  headers,
  source,
  target,
  text,
  targetText,
  onDraft,
  admin = false,
}: {
  url: string;
  headers: () => Record<string, string>;
  source: string;
  target: string;
  text: string;
  targetText: string;
  onDraft: (text: string) => void;
  admin?: boolean;
}) {
  const instance = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const latest = useRef({ source, target, text, targetText, url });
  useLayoutEffect(() => {
    latest.current = { source, target, text, targetText, url };
  }, [source, target, text, targetText, url]);
  useEffect(() => () => request.current?.abort(), []);
  const capabilities = useQuery({
    queryKey: ["organization-translation", instance, url],
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const response = await fetch(url, { headers: headers(), signal });
      if (!response.ok) throw new Error("Translation capabilities unavailable");
      return (await response.json()) as { languages: string[] };
    },
  });
  const languages = capabilities.data?.languages ?? [];
  if (source === target || !languages.includes(source) || !languages.includes(target)) return null;

  async function suggest() {
    const snapshot = latest.current;
    const isCurrent = admin ? captureAdminOrganizationsFence() : () => true;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          text: snapshot.text,
          source: snapshot.source,
          target: snapshot.target,
        }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 429 ? m.translation_rate_limit() : m.translation_error(),
        );
      }
      const draft = (await response.json()) as { text: string };
      if (controller.signal.aborted || !isCurrent()) return;
      if (
        Object.entries(snapshot).some(
          ([key, value]) => latest.current[key as keyof typeof snapshot] !== value,
        )
      ) {
        setError(m.translation_changed());
        return;
      }
      onDraft(draft.text);
    } catch (failure) {
      if (!controller.signal.aborted && isCurrent()) {
        setError(
          failure instanceof Error && failure.message === m.translation_rate_limit()
            ? m.translation_rate_limit()
            : m.translation_error(),
        );
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending || !text.trim() || text.length > 600 || !!targetText.trim()}
        onClick={() => void suggest()}
      >
        {pending ? m.translation_pending() : m.translation_suggest()}
      </Button>
      <p className="text-sm text-subtle" role={pending ? "status" : undefined}>
        {pending ? m.translation_wait() : m.translation_help()}
      </p>
      {error && (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      )}
    </div>
  );
}
