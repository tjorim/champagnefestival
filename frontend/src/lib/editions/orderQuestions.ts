import type { OrderOptionOut, OrderQuestionOut, OrderAnswerOut } from "@/api-types";
import { getLocale } from "@/paraglide/runtime";

export const SCALAR_QUESTION_KINDS = ["single_choice", "free_text", "rating"] as const;
export type ScalarQuestionKind = (typeof SCALAR_QUESTION_KINDS)[number];
export interface ScalarValue {
  option_id?: string | null;
  text?: string | null;
  rating?: number | null;
}
export type OrderOption = OrderOptionOut;
export type OrderQuestion = OrderQuestionOut;
/** Form answers may be incomplete until submitted; saved summaries include the question. */
export type OrderAnswer = import("@/api-types").OrderAnswerIn &
  Partial<Pick<OrderAnswerOut, "question">>;
export function questionText(
  value: object,
  field: "title" | "description" | "label",
  locale = getLocale(),
): string {
  const texts = value as Record<string, unknown>;
  return String(texts[`${field}_${locale}`] || texts[`${field}_nl`] || "");
}
/** API records arrive in their declared shape; form drafts are built by the controls. */
export function parseOrderQuestions(raw: OrderQuestion[] | null | undefined): OrderQuestion[] {
  return raw ?? [];
}
export function parseOrderAnswers(raw: OrderAnswer[] | null | undefined): OrderAnswer[] {
  return raw ?? [];
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
