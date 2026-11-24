import {
  ADMIN_CONTROL_CLASS,
  AdminField,
  AdminInput,
  AdminLabel,
} from "@/components/admin/AdminFields";
import { m } from "@/paraglide/messages";

/**
 * The inputs both question editors share: the volunteer poll (`PollQuestionCard`, `PollOptionsEditor`) and the
 * visitor order questions (`OrderQuestionsEditor`) ask for the same translated title, description and option
 * labels (Dutch required, French and English optional). Each editor keeps its own persistence and adapts its
 * form state to these language-keyed values.
 */
export type QuestionLanguage = "nl" | "fr" | "en";

export type LanguageValues = Record<QuestionLanguage, string>;

export const QUESTION_LANGUAGES = [
  { code: "nl", language: m.admin_language_nl },
  { code: "fr", language: m.admin_language_fr },
  { code: "en", language: m.admin_language_en },
] as const;

const FIELD_LABEL_CLASS = "text-sm text-subtle mb-1";

/** The title and description inputs of a question, one pair per language. */
export function QuestionTextInputs({
  idPrefix,
  title,
  description,
  onChange,
}: {
  idPrefix: string;
  title: LanguageValues;
  description: LanguageValues;
  onChange: (field: "title" | "description", code: QuestionLanguage, value: string) => void;
}) {
  return (
    <div className="grow flex flex-col gap-2">
      {QUESTION_LANGUAGES.map(({ code, language }) => (
        <div key={code} className="flex gap-2 flex-wrap">
          <AdminField controlId={`${idPrefix}-title-${code}`} className="grow basis-60">
            <AdminLabel className={FIELD_LABEL_CLASS}>
              {m.admin_poll_question_title_in({ language: language() })}
            </AdminLabel>
            <AdminInput
              size="sm"
              className={ADMIN_CONTROL_CLASS}
              value={title[code]}
              maxLength={200}
              onChange={(event) => onChange("title", code, event.target.value)}
            />
          </AdminField>
          <AdminField controlId={`${idPrefix}-description-${code}`} className="grow basis-60">
            <AdminLabel className={FIELD_LABEL_CLASS}>
              {m.admin_poll_question_description_in({ language: language() })}
            </AdminLabel>
            <AdminInput
              size="sm"
              className={ADMIN_CONTROL_CLASS}
              value={description[code]}
              maxLength={500}
              onChange={(event) => onChange("description", code, event.target.value)}
            />
          </AdminField>
        </div>
      ))}
    </div>
  );
}

/** The label inputs of one option, one per language. */
export function OptionLabelInputs({
  idPrefix,
  labels,
  onChange,
}: {
  idPrefix: string;
  labels: LanguageValues;
  onChange: (code: QuestionLanguage, value: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {QUESTION_LANGUAGES.map(({ code, language }) => (
        <AdminField key={code} controlId={`${idPrefix}-${code}`} className="grow basis-40">
          <AdminLabel className={FIELD_LABEL_CLASS}>
            {m.admin_poll_label_in({ language: language() })}
          </AdminLabel>
          <AdminInput
            size="sm"
            className={ADMIN_CONTROL_CLASS}
            value={labels[code]}
            maxLength={200}
            onChange={(event) => onChange(code, event.target.value)}
          />
        </AdminField>
      ))}
    </div>
  );
}
