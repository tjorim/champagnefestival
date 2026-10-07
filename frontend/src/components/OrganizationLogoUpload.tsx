import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PublicField, PublicInput, PublicLabel } from "@/components/PublicFields";
import { captureAdminOrganizationsFence } from "@/state/adminOrganizationsCollection";

export default function OrganizationLogoUpload({
  url,
  headers,
  onSaved,
  admin = false,
}: {
  url: string;
  headers: () => Record<string, string>;
  onSaved: (result: { image?: string }) => void;
  admin?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const isCurrent = admin ? captureAdminOrganizationsFence() : () => true;
      const body = new FormData();
      if (!file) throw new Error(m.logo_upload_error());
      body.append("file", file);
      const response = await fetch(url, { method: "POST", headers: headers(), body });
      if (!response.ok) throw new Error(m.logo_upload_error());
      return { result: (await response.json()) as { image?: string }, isCurrent };
    },
    onSuccess: ({ result, isCurrent }) => {
      if (!isCurrent()) return;
      setFile(null);
      if (input.current) input.current.value = "";
      onSaved(result);
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <PublicField>
        <PublicLabel>{m.logo_upload_label()}</PublicLabel>
        <PublicInput
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={mutation.isPending}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            mutation.reset();
          }}
        />
      </PublicField>
      <p className="text-sm text-subtle">{m.logo_upload_help()}</p>
      <p className="text-sm text-subtle">
        {admin ? m.logo_upload_admin_help() : m.manager_change_help()}
      </p>
      <Button
        type="button"
        disabled={!file || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {m.logo_upload_label()}
      </Button>
      {mutation.isError && (
        <Alert variant="danger" role="alert">
          {m.logo_upload_error()}
        </Alert>
      )}
      {mutation.isSuccess && <p role="status">{m.logo_upload_success()}</p>}
    </div>
  );
}
