import type { ComponentType } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import { dietaryTagLabel } from "@/utils/dietaryTags";
import {
  answerMyMealsQuestion,
  answerMyYesNoQuestion,
  MAX_POLL_PEOPLE,
  MAX_POLL_QUANTITY,
  type MyPoll,
  type MyPollQuestion,
} from "@/utils/myVolunteerApi";
import type { PollQuestionKind } from "@/utils/pollKinds";

export type SaveAnswer = (action: (accessToken: string, locale: string) => Promise<MyPoll>) => void;

export interface AnswerInputProps {
  question: MyPollQuestion;
  /** Disables the controls while an answer is being saved. */
  saving: boolean;
  save: SaveAnswer;
}

function YesNoAnswer({ question, saving, save }: AnswerInputProps) {
  const locked = question.closed || saving;
  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      role="group"
      aria-labelledby={`my-poll-${question.id}-title`}
    >
      <Button
        variant={question.attending === true ? "warning" : "outline"}
        size="sm"
        aria-pressed={question.attending === true}
        disabled={locked}
        onClick={() =>
          save((accessToken, locale) =>
            answerMyYesNoQuestion(accessToken, locale, question.id, true, question.people || 1),
          )
        }
      >
        {m.poll_answer_yes()}
      </Button>
      <Button
        variant={question.attending === false ? "warning" : "outline"}
        size="sm"
        aria-pressed={question.attending === false}
        disabled={locked}
        onClick={() =>
          save((accessToken, locale) =>
            answerMyYesNoQuestion(accessToken, locale, question.id, false, 0),
          )
        }
      >
        {m.poll_answer_no()}
      </Button>
      {question.attending === true && (
        <span className="flex items-center gap-2">
          <span id={`my-poll-${question.id}-people`} className="text-sm">
            {m.my_poll_people_label()}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={question.people <= 1 || locked}
            onClick={() =>
              save((accessToken, locale) =>
                answerMyYesNoQuestion(accessToken, locale, question.id, true, question.people - 1),
              )
            }
            aria-label={m.my_poll_people_decrease({ title: question.title })}
          >
            <Icon icon={MinusIcon} />
          </Button>
          <span className="min-w-6 text-center" aria-live="polite">
            {question.people}
          </span>
          <Button
            variant="outline-warning"
            size="sm"
            disabled={question.people >= MAX_POLL_PEOPLE || locked}
            onClick={() =>
              save((accessToken, locale) =>
                answerMyYesNoQuestion(accessToken, locale, question.id, true, question.people + 1),
              )
            }
            aria-label={m.my_poll_people_increase({ title: question.title })}
          >
            <Icon icon={PlusIcon} />
          </Button>
        </span>
      )}
    </div>
  );
}

function MealsAnswer({ question, saving, save }: AnswerInputProps) {
  const locked = question.closed || saving;
  return (
    <>
      <p className="text-sm mb-2">{m.my_poll_meals_hint()}</p>
      <ul className="list-none p-0 mb-2">
        {question.options.map((option) => {
          const quantity = question.selections[option.id] ?? 0;
          const setQuantity = (next: number) =>
            save((accessToken, locale) =>
              answerMyMealsQuestion(accessToken, locale, question.id, {
                ...question.selections,
                [option.id]: next,
              }),
            );
          return (
            <li key={option.id} className="flex items-center justify-between gap-2 mb-2">
              <span>
                <span id={`my-poll-${option.id}-label`}>{option.label}</span>
                {option.dietaryTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="ms-2">
                    {dietaryTagLabel(tag)}
                  </Badge>
                ))}
              </span>
              <div
                className="flex items-center gap-2"
                role="group"
                aria-labelledby={`my-poll-${option.id}-label`}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={quantity === 0 || locked}
                  onClick={() => setQuantity(quantity - 1)}
                  aria-label={m.my_poll_quantity_decrease({ label: option.label })}
                >
                  <Icon icon={MinusIcon} />
                </Button>
                <span className="min-w-6 text-center" aria-live="polite">
                  {quantity}
                </span>
                <Button
                  variant="outline-warning"
                  size="sm"
                  disabled={quantity >= MAX_POLL_QUANTITY || locked}
                  onClick={() => setQuantity(quantity + 1)}
                  aria-label={m.my_poll_quantity_increase({ label: option.label })}
                >
                  <Icon icon={PlusIcon} />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** How a volunteer answers each kind of question. */
export const ANSWER_INPUTS: Record<PollQuestionKind, ComponentType<AnswerInputProps>> = {
  yes_no: YesNoAnswer,
  meals: MealsAnswer,
};
