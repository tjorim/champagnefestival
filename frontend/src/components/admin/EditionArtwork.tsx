import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ImageUpIcon, TrashIcon } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Spinner } from "@/components/ui/spinner";
import {
  AdminDescription,
  AdminField,
  AdminInput,
  AdminLabel,
} from "@/components/admin/AdminFields";
import { m } from "@/paraglide/messages";
import {
  clearEditionArtwork,
  uploadEditionArtwork,
  type EditionArtworkSlot,
} from "@/utils/adminContentApi";
import { DEFAULT_FLYER, DEFAULT_HERO, DEFAULT_SHARE, managedArtwork } from "@/utils/editionArtwork";
import type { Edition } from "./editionTypes";

interface SlotConfig {
  slot: EditionArtworkSlot;
  label: () => string;
  hint: () => string;
  fallback: string;
  current: (edition: Edition) => string | null | undefined;
  previewClass: string;
}

const SLOTS: SlotConfig[] = [
  {
    slot: "flyer",
    label: () => m.admin_edition_artwork_flyer(),
    hint: () => m.admin_edition_artwork_flyer_hint(),
    fallback: DEFAULT_FLYER,
    current: (edition) => edition.flyerImage,
    previewClass: "h-32 w-auto",
  },
  {
    slot: "hero",
    label: () => m.admin_edition_artwork_hero(),
    hint: () => m.admin_edition_artwork_hero_hint(),
    fallback: DEFAULT_HERO,
    current: (edition) => edition.heroImage,
    previewClass: "h-20 w-auto",
  },
  {
    slot: "share",
    label: () => m.admin_edition_artwork_share(),
    hint: () => m.admin_edition_artwork_share_hint(),
    fallback: DEFAULT_SHARE,
    current: (edition) => edition.shareImage,
    previewClass: "h-20 w-auto",
  },
];

interface EditionArtworkProps {
  edition: Edition;
  authHeaders: () => Record<string, string>;
  onUpdated: (edition: Edition) => void;
}

function ArtworkSlot({
  config,
  edition,
  authHeaders,
  onUpdated,
}: EditionArtworkProps & { config: SlotConfig }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const uploaded = managedArtwork(config.current(edition));
  const label = config.label();

  const upload = useMutation({
    retry: false,
    mutationFn: (selected: File) =>
      uploadEditionArtwork(edition.id, config.slot, selected, authHeaders),
    onSuccess: (updated) => {
      setFile(null);
      if (input.current) input.current.value = "";
      setMessage(m.admin_edition_artwork_uploaded({ slot: label }));
      onUpdated(updated);
    },
  });
  const clear = useMutation({
    retry: false,
    mutationFn: () => clearEditionArtwork(edition.id, config.slot, authHeaders),
    onSuccess: (updated) => {
      setMessage(m.admin_edition_artwork_cleared({ slot: label }));
      onUpdated(updated);
    },
  });
  const busy = upload.isPending || clear.isPending;
  const error = upload.error ?? clear.error;

  return (
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start">
      <img
        src={uploaded ?? config.fallback}
        alt={m.admin_edition_artwork_preview_alt({ slot: label })}
        className={`${config.previewClass} shrink-0 rounded border border-border bg-muted object-contain`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <AdminField>
          <AdminLabel>{label}</AdminLabel>
          <AdminDescription>
            {config.hint()} {!uploaded && m.admin_edition_artwork_default_in_use()}
          </AdminDescription>
          <AdminInput
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setMessage("");
              upload.reset();
              clear.reset();
            }}
          />
        </AdminField>
        <span className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            size="sm"
            disabled={!file || busy}
            onClick={() => file && upload.mutate(file)}
            aria-label={m.admin_edition_artwork_upload_slot({ slot: label })}
          >
            {upload.isPending ? (
              <Spinner size="sm" aria-hidden="true" />
            ) : (
              <Icon icon={ImageUpIcon} />
            )}
            {uploaded ? m.admin_edition_artwork_replace() : m.admin_edition_artwork_upload()}
          </Button>
          {uploaded && (
            <Button
              type="button"
              size="sm"
              variant="outline-danger"
              disabled={busy}
              onClick={() => clear.mutate()}
              aria-label={m.admin_edition_artwork_clear_slot({ slot: label })}
            >
              {clear.isPending ? (
                <Spinner size="sm" aria-hidden="true" />
              ) : (
                <Icon icon={TrashIcon} />
              )}
              {m.admin_edition_artwork_clear()}
            </Button>
          )}
        </span>
        {error && (
          <Alert variant="danger" role="alert">
            {error.message}
          </Alert>
        )}
        {message && !error && (
          <p role="status" className="text-sm text-subtle">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Upload, preview, replace and clear an edition's flyer, hero photo and sharing
 * image (#1224). Changes are live immediately; an empty slot uses the static
 * default shown in its preview.
 */
export default function EditionArtwork({ edition, authHeaders, onUpdated }: EditionArtworkProps) {
  return (
    <section aria-labelledby={`edition-artwork-${edition.id}`} className="mb-2">
      <h6 id={`edition-artwork-${edition.id}`} className="text-highlight mb-1 text-sm">
        {m.admin_edition_artwork_title()}
      </h6>
      <p className="text-subtle text-sm mb-1">{m.admin_edition_artwork_help()}</p>
      {SLOTS.map((config) => (
        <ArtworkSlot
          key={config.slot}
          config={config}
          edition={edition}
          authHeaders={authHeaders}
          onUpdated={onUpdated}
        />
      ))}
    </section>
  );
}
