import type { ComponentType } from "react";
import {
  AdminField,
  AdminLabel,
  AdminSelect,
  AdminOption,
  AdminTextarea,
} from "@/components/admin/AdminFields";
import { PublicLabel, PublicSelect, PublicTextarea } from "@/components/PublicFields";
import { m } from "@/paraglide/messages";
import type { ScalarQuestionKind, ScalarValue } from "@/utils/orderQuestions";

export interface ScalarAnswerFieldsProps {
  id: string;
  kind: ScalarQuestionKind;
  label: string;
  options: { id: string; label: string }[];
  value: ScalarValue;
  disabled?: boolean;
  admin?: boolean;
  onChange: (value: ScalarValue) => void;
}
const FIELDS: Record<ScalarQuestionKind, ComponentType<ScalarAnswerFieldsProps>> = {
  single_choice: ({ value, options, disabled, admin, onChange }) => {
    const Select = admin ? AdminSelect : PublicSelect;
    return (
      <Select
        value={value.option_id ?? ""}
        disabled={disabled}
        onValueChange={(id) => onChange({ option_id: id || null })}
      >
        <AdminOption value="">{m.poll_answer_none()}</AdminOption>
        {options.map((o) => (
          <AdminOption key={o.id} value={o.id}>
            {o.label}
          </AdminOption>
        ))}
      </Select>
    );
  },
  free_text: ({ value, disabled, admin, onChange }) => {
    const Textarea = admin ? AdminTextarea : PublicTextarea;
    return (
      <Textarea
        rows={3}
        maxLength={500}
        value={value.text ?? ""}
        disabled={disabled}
        onChange={(event) => onChange({ text: event.target.value })}
      />
    );
  },
  rating: ({ value, disabled, admin, onChange }) => {
    const Select = admin ? AdminSelect : PublicSelect;
    return (
      <Select
        value={String(value.rating ?? "")}
        disabled={disabled}
        onValueChange={(rating) => onChange({ rating: rating ? Number(rating) : null })}
      >
        <AdminOption value="">{m.poll_answer_none()}</AdminOption>
        {[1, 2, 3, 4, 5].map((rating) => (
          <AdminOption key={rating} value={String(rating)}>
            {rating}
          </AdminOption>
        ))}
      </Select>
    );
  },
};
export default function ScalarAnswerFields(props: ScalarAnswerFieldsProps) {
  const Label = props.admin ? AdminLabel : PublicLabel;
  const Field = FIELDS[props.kind];
  return (
    <AdminField controlId={props.id}>
      <Label>{props.label}</Label>
      <Field {...props} />
    </AdminField>
  );
}
