import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AdminCheck,
  AdminField,
  AdminLabel,
  AdminOption,
  AdminSelect,
} from "@/components/admin/AdminFields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import { fetchJsonOrThrow } from "@/lib/api/adminApi";
import { apiErrorMessage } from "@/lib/api/apiErrors";
import {
  parseOrderQuestions,
  SCALAR_QUESTION_KINDS,
  type OrderQuestion,
} from "@/lib/editions/orderQuestions";
import { POLL_KIND_HAS_OPTIONS, pollKindLabel } from "@/lib/editions/pollKinds";
import { OptionLabelInputs, QuestionTextInputs } from "./QuestionEditorFields";

function Configuration({ eventId }: { eventId: string }) {
  const [draft, setDraft] = useState<OrderQuestion[] | null>(null);
  const [saved, setSaved] = useState(false);
  const query = useQuery({
    queryKey: ["event-order-questions", eventId],
    queryFn: async () => {
      const event = await fetchJsonOrThrow<import("@/api-types").EventOut>(
        `/api/events/${encodeURIComponent(eventId)}`,
        {},
        m.admin_content_error_load(),
      );
      return parseOrderQuestions(event.order_questions);
    },
  });
  const questions = draft ?? query.data ?? [];
  const save = useMutation({
    mutationFn: () =>
      fetchJsonOrThrow<OrderQuestion[]>(
        `/api/events/${encodeURIComponent(eventId)}/order-questions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
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
          <QuestionTextInputs
            idPrefix={`order-question-${q.id}`}
            title={{ nl: q.title_nl, fr: q.title_fr ?? "", en: q.title_en ?? "" }}
            description={{
              nl: q.description_nl ?? "",
              fr: q.description_fr ?? "",
              en: q.description_en ?? "",
            }}
            onChange={(field, code, value) =>
              patch(q.id, { [`${field}_${code}`]: value || null } as Partial<OrderQuestion>)
            }
          />
          {POLL_KIND_HAS_OPTIONS[q.kind] && (
            <div className="mt-4">
              {q.options.map((option) => (
                <div key={option.id} className="flex flex-wrap gap-2 items-end mb-2">
                  <div className="grow">
                    <OptionLabelInputs
                      idPrefix={`order-option-${option.id}`}
                      labels={{
                        nl: option.label_nl,
                        fr: option.label_fr ?? "",
                        en: option.label_en ?? "",
                      }}
                      onChange={(code, value) =>
                        patch(q.id, {
                          options: q.options.map((o) =>
                            o.id === option.id ? { ...o, [`label_${code}`]: value || null } : o,
                          ),
                        })
                      }
                    />
                  </div>
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
export default function OrderQuestionsEditor(props: { eventId: string }) {
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
