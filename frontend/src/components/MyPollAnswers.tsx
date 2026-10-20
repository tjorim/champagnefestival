import { useState, type ComponentType } from "react";
import ScalarAnswerFields from "@/components/ScalarAnswerFields";
import { answerMyScalarQuestion } from "@/utils/myVolunteerApi";
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

type SaveAnswer = (action: (accessToken: string, locale: string) => Promise<MyPoll>) => void;

interface AnswerInputProps {
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

function SingleChoiceAnswer({ question, saving, save }: AnswerInputProps) {
  return (
    <ScalarAnswerFields
      id={`my-poll-choice-${question.id}`}
      kind="single_choice"
      label={m.admin_poll_order_answer_label()}
      options={question.options}
      value={{ option_id: question.optionId }}
      disabled={question.closed || saving}
      onChange={(value) =>
        save((token, locale) =>
          answerMyScalarQuestion(token, locale, question.id, {
            option_id: value.option_id ?? null,
          }),
        )
      }
    />
  );
}

function FreeTextAnswer({ question, saving, save }: AnswerInputProps) {
  const saved = question.text ?? "";
  const [draft, setDraft] = useState<{ saved: string; text: string } | null>(null);
  const text = draft?.saved === saved ? draft.text : saved;
  return (
    <>
      <ScalarAnswerFields
        id={`my-poll-text-${question.id}`}
        kind="free_text"
        label={m.admin_poll_order_answer_label()}
        options={[]}
        value={{ text }}
        disabled={question.closed || saving}
        onChange={(value) => setDraft({ saved, text: value.text ?? "" })}
      />
      <Button
        className="mt-2"
        size="sm"
        variant="outline"
        disabled={question.closed || saving || text.trim() === saved}
        onClick={() =>
          save((token, locale) =>
            answerMyScalarQuestion(token, locale, question.id, { text: text.trim() || null }),
          )
        }
      >
        {m.poll_answer_save()}
      </Button>
    </>
  );
}

function RatingAnswer({ question, saving, save }: AnswerInputProps) {
  return (
    <ScalarAnswerFields
      id={`my-poll-rating-${question.id}`}
      kind="rating"
      label={m.poll_rating_label()}
      options={[]}
      value={{ rating: question.rating }}
      disabled={question.closed || saving}
      onChange={(value) =>
        save((token, locale) =>
          answerMyScalarQuestion(token, locale, question.id, { rating: value.rating ?? null }),
        )
      }
    />
  );
}

/** How a volunteer answers each kind of question. */
export const ANSWER_INPUTS: Record<PollQuestionKind, ComponentType<AnswerInputProps>> = {
  yes_no: YesNoAnswer,
  meals: MealsAnswer,
  single_choice: SingleChoiceAnswer,
  free_text: FreeTextAnswer,
  rating: RatingAnswer,
};
