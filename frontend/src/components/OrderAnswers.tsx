import ScalarAnswerFields from "@/components/ScalarAnswerFields";
import { m } from "@/paraglide/messages";
import {
  orderAnswerText,
  questionText,
  type OrderAnswer,
  type OrderQuestion,
} from "@/utils/orderQuestions";

export function OrderAnswerInputs({
  questions,
  answers,
  onChange,
  disabled,
  admin,
}: {
  questions: OrderQuestion[];
  answers: OrderAnswer[];
  onChange: (answers: OrderAnswer[]) => void;
  disabled?: boolean;
  admin?: boolean;
}) {
  return questions.length ? (
    <fieldset className="border-0 p-0 m-0 mb-4">
      <legend className="text-base font-medium mb-2">{m.order_questions_heading()}</legend>
      <p className="text-sm mb-2">{m.order_questions_help()}</p>
      {questions.map((q) => (
        <section key={q.id} className="mb-4">
          {questionText(q, "description") && (
            <p className="text-sm mb-2">{questionText(q, "description")}</p>
          )}
          <ScalarAnswerFields
            id={`order-answer-${q.id}`}
            kind={q.kind}
            label={questionText(q, "title")}
            options={q.options.map((o) => ({ id: o.id, label: questionText(o, "label") }))}
            value={answers.find((a) => a.question_id === q.id) ?? {}}
            disabled={disabled}
            admin={admin}
            onChange={(value) =>
              onChange([
                ...answers.filter((a) => a.question_id !== q.id),
                { question_id: q.id, ...value },
              ])
            }
          />
        </section>
      ))}
    </fieldset>
  ) : null;
}
export function OrderAnswerSummary({ answers = [] }: { answers?: OrderAnswer[] }) {
  return answers.length ? (
    <dl className="text-sm mb-2">
      {answers.map((a) => (
        <div key={a.question_id}>
          <dt className="font-medium">{questionText(a.question ?? {}, "title")}</dt>
          <dd className="mb-2 whitespace-pre-wrap">{orderAnswerText(a)}</dd>
        </div>
      ))}
    </dl>
  ) : null;
}
