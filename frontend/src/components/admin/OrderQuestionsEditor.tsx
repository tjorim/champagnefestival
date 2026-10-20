import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AdminCheck,
  AdminField,
  AdminInput,
  AdminLabel,
  AdminOption,
  AdminSelect,
  AdminTextarea,
} from "@/components/admin/AdminFields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import { fetchJsonOrThrowWithUnauthorized } from "@/utils/adminApi";
import { apiErrorMessage } from "@/utils/apiErrors";
import {
  parseOrderQuestions,
  SCALAR_QUESTION_KINDS,
  type OrderQuestion,
} from "@/utils/orderQuestions";
import { POLL_KIND_HAS_OPTIONS, pollKindLabel } from "@/utils/pollKinds";

const LANGUAGES = [
  { code: "nl", label: m.admin_language_nl },
  { code: "fr", label: m.admin_language_fr },
  { code: "en", label: m.admin_language_en },
] as const;

function Configuration({
  eventId,
  authHeaders,
}: {
  eventId: string;
  authHeaders: () => Record<string, string>;
}) {
  const [draft, setDraft] = useState<OrderQuestion[] | null>(null);
  const [saved, setSaved] = useState(false);
  const query = useQuery({
    queryKey: ["event-order-questions", eventId],
    queryFn: async () => {
      const event = await fetchJsonOrThrowWithUnauthorized<Record<string, unknown>>(
        `/api/events/${encodeURIComponent(eventId)}`,
        { headers: authHeaders() },
        m.admin_content_error_load(),
      );
      return parseOrderQuestions(event.order_questions);
    },
  });
  const questions = draft ?? query.data ?? [];
  const save = useMutation({
    mutationFn: () =>
      fetchJsonOrThrowWithUnauthorized<unknown>(
        `/api/events/${encodeURIComponent(eventId)}/order-questions`,
        {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ questions }),
        },
        m.admin_content_error_save(),
      ),
    retry: false,
    onSuccess: (data) => {
      setDraft(parseOrderQuestions(data));
      setSaved(true);
    },
  });
  function change(next: OrderQuestion[]) {
    setDraft(next);
    setSaved(false);
  }
  function patch(id: string, update: Partial<OrderQuestion>) {
    change(questions.map((q) => (q.id === id ? { ...q, ...update } : q)));
  }
  if (query.isPending) return <p>{m.loading()}</p>;
  if (query.isError) return <Alert variant="danger">{m.admin_content_error_load()}</Alert>;
  return (
    <fieldset className="border-0 p-0 mt-4" disabled={save.isPending}>
      <legend className="text-base font-medium">{m.order_questions_heading()}</legend>
      <p className="text-sm">{m.order_questions_admin_help()}</p>
      {questions.map((q, index) => (
        <fieldset key={q.id} className="border border-input rounded-md p-4 mb-4">
          <legend className="text-sm">{q.title_nl || pollKindLabel(q.kind)}</legend>
          <AdminField controlId={`order-kind-${q.id}`}>
            <AdminLabel>{m.admin_poll_question_kind_label()}</AdminLabel>
            <AdminSelect
              value={q.kind}
              onValueChange={(kind) => {
                if (SCALAR_QUESTION_KINDS.includes(kind as OrderQuestion["kind"]))
                  patch(q.id, { kind: kind as OrderQuestion["kind"], options: [] });
              }}
            >
              {SCALAR_QUESTION_KINDS.map((kind) => (
                <AdminOption key={kind} value={kind}>
                  {pollKindLabel(kind)}
                </AdminOption>
              ))}
            </AdminSelect>
          </AdminField>
          {LANGUAGES.map(({ code, label }) => (
            <div key={code} className="flex flex-wrap gap-2 mt-2">
              <AdminField controlId={`order-title-${q.id}-${code}`} className="grow basis-40">
                <AdminLabel>{m.admin_poll_question_title_in({ language: label() })}</AdminLabel>
                <AdminInput
                  value={q[`title_${code}`] ?? ""}
                  maxLength={200}
                  onChange={(e) => patch(q.id, { [`title_${code}`]: e.target.value || null })}
                />
              </AdminField>
              <AdminField controlId={`order-description-${q.id}-${code}`} className="grow basis-40">
                <AdminLabel>
                  {m.admin_poll_question_description_in({ language: label() })}
                </AdminLabel>
                <AdminTextarea
                  rows={2}
                  maxLength={500}
                  value={q[`description_${code}`] ?? ""}
                  onChange={(e) => patch(q.id, { [`description_${code}`]: e.target.value || null })}
                />
              </AdminField>
            </div>
          ))}
          {POLL_KIND_HAS_OPTIONS[q.kind] && (
            <div className="mt-4">
              {q.options.map((option) => (
                <div key={option.id} className="flex flex-wrap gap-2 items-end mb-2">
                  {LANGUAGES.map(({ code, label }) => (
                    <AdminField
                      key={code}
                      controlId={`order-option-${option.id}-${code}`}
                      className="grow basis-40"
                    >
                      <AdminLabel>{m.admin_poll_label_in({ language: label() })}</AdminLabel>
                      <AdminInput
                        maxLength={200}
                        value={option[`label_${code}`] ?? ""}
                        onChange={(e) =>
                          patch(q.id, {
                            options: q.options.map((o) =>
                              o.id === option.id
                                ? { ...o, [`label_${code}`]: e.target.value || null }
                                : o,
                            ),
                          })
                        }
                      />
                    </AdminField>
                  ))}
                  <Button
                    type="button"
                    variant="outline-danger"
                    onClick={() =>
                      patch(q.id, { options: q.options.filter((o) => o.id !== option.id) })
                    }
                  >
                    {m.admin_delete()}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={q.options.length >= 200}
                onClick={() =>
                  patch(q.id, {
                    options: [
                      ...q.options,
                      { id: crypto.randomUUID(), label_nl: "", label_fr: null, label_en: null },
                    ],
                  })
                }
              >
                {m.order_questions_add_option()}
              </Button>
            </div>
          )}
          <div className="flex gap-2 items-center mt-4 flex-wrap">
            <AdminCheck
              id={`order-active-${q.id}`}
              label={m.admin_content_edition_active()}
              checked={q.active}
              onCheckedChange={(active) => patch(q.id, { active })}
            />
            <Button
              type="button"
              variant="outline"
              disabled={index === 0}
              onClick={() => {
                const next = [...questions];
                [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                change(next);
              }}
            >
              {m.admin_poll_move_up({ label: q.title_nl })}
            </Button>
            <Button
              type="button"
              variant="outline-danger"
              onClick={() => change(questions.filter((item) => item.id !== q.id))}
            >
              {m.admin_delete()}
            </Button>
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={questions.length >= 50}
          onClick={() =>
            change([
              ...questions,
              {
                id: crypto.randomUUID(),
                kind: "free_text",
                active: true,
                title_nl: "",
                title_fr: null,
                title_en: null,
                description_nl: null,
                description_fr: null,
                description_en: null,
                options: [],
              },
            ])
          }
        >
          {m.admin_poll_question_add_button()}
        </Button>
        <Button type="button" variant="outline-primary" onClick={() => save.mutate()}>
          {m.order_questions_save()}
        </Button>
      </div>
      {save.isError && (
        <Alert variant="danger" className="mt-2">
          {apiErrorMessage(save.error, m.admin_content_error_save())}
        </Alert>
      )}
      {saved && (
        <p role="status" className="text-sm mt-2">
          {m.order_questions_saved()}
        </p>
      )}
    </fieldset>
  );
}
export default function OrderQuestionsEditor(props: {
  eventId: string;
  authHeaders: () => Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-t border-input pt-4 mt-4">
      <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        {m.order_questions_heading()}
      </Button>
      {open && <Configuration {...props} />}
    </section>
  );
}
