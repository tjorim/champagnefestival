import { getLocale } from "@/paraglide/runtime";

export const SCALAR_QUESTION_KINDS = ["single_choice", "free_text", "rating"] as const;
export type ScalarQuestionKind = (typeof SCALAR_QUESTION_KINDS)[number];
export interface ScalarValue {
  option_id?: string | null;
  text?: string | null;
  rating?: number | null;
}
export interface OrderOption {
  id: string;
  label_nl: string;
  label_fr: string | null;
  label_en: string | null;
}
export interface OrderQuestion {
  id: string;
  kind: ScalarQuestionKind;
  active: boolean;
  title_nl: string;
  title_fr: string | null;
  title_en: string | null;
  description_nl: string | null;
  description_fr: string | null;
  description_en: string | null;
  options: OrderOption[];
}
export interface OrderAnswer extends ScalarValue {
  question_id: string;
  question?: OrderQuestion;
}
export function questionText(
  value: object,
  field: "title" | "description" | "label",
  locale = getLocale(),
): string {
  const texts = value as Record<string, unknown>;
  return String(texts[`${field}_${locale}`] || texts[`${field}_nl`] || "");
}
export function parseOrderQuestions(raw: unknown): OrderQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q) => q && SCALAR_QUESTION_KINDS.includes(q.kind))
    .map((q) => ({
      id: String(q.id),
      kind: q.kind,
      active: q.active !== false,
      title_nl: String(q.title_nl ?? ""),
      title_fr: q.title_fr ?? null,
      title_en: q.title_en ?? null,
      description_nl: q.description_nl ?? null,
      description_fr: q.description_fr ?? null,
      description_en: q.description_en ?? null,
      options: (Array.isArray(q.options) ? q.options : []).map((o: OrderOption) => ({
        id: String(o.id),
        label_nl: String(o.label_nl ?? ""),
        label_fr: o.label_fr ?? null,
        label_en: o.label_en ?? null,
      })),
    }));
}
export function parseOrderAnswers(raw: unknown): OrderAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => ({
    question_id: String(a.question_id),
    option_id: typeof a.option_id === "string" ? a.option_id : null,
    text: typeof a.text === "string" ? a.text : null,
    rating: typeof a.rating === "number" ? a.rating : null,
    question: parseOrderQuestions([a.question])[0],
  }));
}
export function orderAnswersBody(answers: OrderAnswer[] = []) {
  return answers.map(({ question_id, option_id, text, rating }) => ({
    question_id,
    option_id,
    text,
    rating,
  }));
}
export function orderAnswerText(answer: OrderAnswer): string {
  if (answer.option_id)
    return questionText(
      answer.question?.options.find((o) => o.id === answer.option_id) ?? {},
      "label",
    );
  return String(answer.text ?? answer.rating ?? "");
}
