import { useEffect, useState } from "react";
import { m } from "@/paraglide/messages";
import ResponsiveImage from "@/components/ResponsiveImage";

/** Blob URLs allow authenticated bearer previews without exposing credentials in URLs. */
export default function OrganizationLogoPreview({
  url,
  headers,
}: {
  url: string;
  headers: () => Record<string, string>;
}) {
  const [image, setImage] = useState<{ url: string; src: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void fetch(url, { headers: headers(), signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setError(null);
        setImage({ url, src: objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(url);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, headers]);
  if (error === url) return <p role="alert">{m.logo_preview_error()}</p>;
  return image?.url === url ? (
    <ResponsiveImage src={image.src} alt={m.manager_change_proposed()} className="max-w-64" />
  ) : null;
}
