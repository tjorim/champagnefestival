import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getLocale } from "@/paraglide/runtime";
import { m } from "@/paraglide/messages";
import {
  COMPOSED_MESSAGE_LOCALES,
  composedSendBlockedByMail,
  composedTextFor,
  type ComposedMessage,
} from "@/utils/composedMessage";

function levelLabel(level: ComposedMessage["level"]): string {
  switch (level) {
    case "info":
      return m.admin_announcement_level_info();
    case "warning":
      return m.admin_announcement_level_warning();
    case "urgent":
      return m.admin_announcement_level_urgent();
  }
}

/**
 * Body of the send confirmation (#1432): the exact saved message about to be queued, and for
 * each selected channel only what that channel will do. Rendered from the row captured when the
 * dialog opened, so a list refetch cannot change what is being reviewed; the server refuses the
 * send if the message was saved again (`expected_updated_at`).
 */
export default function ComposerSendReview({
  item,
  categoryName,
}: {
  item: ComposedMessage;
  categoryName: string;
}) {
  const savedAt = new Date(item.updated_at).toLocaleString(getLocale());
  return (
    <div className="space-y-3 text-left text-sm">
      <p className="text-subtle mb-0">{m.admin_composer_review_saved({ time: savedAt })}</p>

      <div className="space-y-2">
        {COMPOSED_MESSAGE_LOCALES.map((locale) => {
          const text = composedTextFor(item, locale);
          return (
            <div key={locale} className="rounded-md border border-border p-2 break-words">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge variant="secondary">{locale.toUpperCase()}</Badge>
                <span className="text-subtle">
                  {text.fallback
                    ? m.admin_composer_review_text_fallback()
                    : m.admin_composer_review_text_own()}
                </span>
              </div>
              <p className="font-medium mb-0">{text.title}</p>
              <p className="mb-0 whitespace-pre-line">{text.body}</p>
            </div>
          );
        })}
      </div>

      <p className="mb-0">{m.admin_composer_review_level({ level: levelLabel(item.level) })}</p>
      {item.link_url && (
        <p className="mb-0 break-all">{m.admin_composer_review_link({ url: item.link_url })}</p>
      )}

      <div>
        <p className="font-medium mb-1">{m.admin_composer_review_channels()}</p>
        <ul className="list-disc pl-5 space-y-1 mb-0">
          {item.channels.includes("announcement") && (
            <li>{m.admin_composer_review_announcement()}</li>
          )}
          {item.channels.includes("push") && (
            <li>
              {item.estimated_push_audience > 0
                ? m.admin_composer_review_push({ count: item.estimated_push_audience })
                : m.admin_composer_review_push_empty()}
            </li>
          )}
          {item.channels.includes("email") && (
            <li>
              {item.estimated_email_audience > 0
                ? m.admin_composer_review_email({
                    count: item.estimated_email_audience,
                    category: categoryName,
                  })
                : m.admin_composer_review_email_empty({ category: categoryName })}
            </li>
          )}
        </ul>
      </div>

      {composedSendBlockedByMail(item) && (
        <Alert variant="warning">{m.admin_composer_review_email_unavailable()}</Alert>
      )}
      <p className="font-medium mb-0">{m.admin_composer_review_timing()}</p>
    </div>
  );
}
