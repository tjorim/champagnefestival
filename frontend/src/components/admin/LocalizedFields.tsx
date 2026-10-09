/**
 * Shared admin inputs for translated content: an "original language" picker and
 * one input per language. The original language must have text; the others are
 * optional translations, and visitors fall back to the original (same rule for
 * events, FAQ items, announcements, policies, products, ...).
 */

import type { ReactNode } from "react";
import {
  AdminField,
  AdminInput,
  AdminLabel,
  AdminOption,
  AdminSelect,
  AdminTextarea,
} from "@/components/admin/AdminFields";
import { m } from "@/paraglide/messages";
import type { EventLanguage } from "@/types/event";

export type Language = EventLanguage;

export const LANGUAGES = [
  { language: "nl", name: () => m.admin_language_nl() },
  { language: "fr", name: () => m.admin_language_fr() },
  { language: "en", name: () => m.admin_language_en() },
] as const;

export type LocalizedText = Record<Language, string>;

export const EMPTY_LOCALIZED_TEXT: LocalizedText = { nl: "", fr: "", en: "" };

/** True when the original language has non-blank text. */
export function hasOriginal(language: Language, text: LocalizedText): boolean {
  return Boolean(text[language].trim());
}

export function OriginalLanguageSelect({
  controlId,
  label,
  value,
  onChange,
}: {
  controlId: string;
  label: ReactNode;
  value: Language;
  onChange: (language: Language) => void;
}) {
  return (
    <AdminField className="mb-4 max-w-60" controlId={controlId}>
      <AdminLabel>{label}</AdminLabel>
      <AdminSelect value={value} onValueChange={(next) => onChange(next as Language)}>
        {LANGUAGES.map(({ language, name }) => (
          <AdminOption key={language} value={language}>
            {name()}
          </AdminOption>
        ))}
      </AdminSelect>
    </AdminField>
  );
}

/** One input (or textarea) per language, labelled with the language name. */
export function LocalizedInputs({
  idPrefix,
  label,
  values,
  onChange,
  multiline = false,
  maxLength,
  rows = 3,
}: {
  idPrefix: string;
  /** Label for the field in a language, e.g. `(name) => m.admin_event_title_label({ language: name })`. */
  label: (languageName: string) => string;
  values: LocalizedText;
  onChange: (language: Language, text: string) => void;
  multiline?: boolean;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <>
      {LANGUAGES.map(({ language, name }) => (
        <AdminField key={language} className="mb-4" controlId={`${idPrefix}-${language}`}>
          <AdminLabel>{label(name())}</AdminLabel>
          {multiline ? (
            <AdminTextarea
              rows={rows}
              maxLength={maxLength}
              value={values[language]}
              onChange={(event) => onChange(language, event.target.value)}
              className="bg-muted text-content border-input"
            />
          ) : (
            <AdminInput
              type="text"
              maxLength={maxLength}
              value={values[language]}
              onChange={(event) => onChange(language, event.target.value)}
              className="bg-muted text-content border-input"
            />
          )}
        </AdminField>
      ))}
    </>
  );
}
