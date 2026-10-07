import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PublicInput, PublicLabel } from "@/components/PublicFields";
import { m } from "@/paraglide/messages";

interface Exhibitor {
  id: number;
  name: string;
  type: string;
  website: string;
  active: boolean;
}

async function api<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  if (!response.ok) throw new Error(m.manager_error());
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export default function MyExhibitorsPage() {
  const { token } = useSearch({ from: "/my-exhibitors" });
  const navigate = useNavigate({ from: "/my-exhibitors" });
  const started = useRef(false);
  const [rows, setRows] = useState<Exhibitor[] | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function load() {
      if (token) {
        await navigate({ search: {}, replace: true });
        await api("/api/exhibitor-manager-sessions/redeem", { token });
      }
      const status = await api<{ authenticated: boolean }>(
        "/api/exhibitor-manager-sessions/status",
      );
      if (status.authenticated) setRows(await api<Exhibitor[]>("/api/me/exhibitors"));
    }
    void load()
      .catch(() => setMessage(m.manager_error()))
      .finally(() => setBusy(false));
  }, [navigate, token]);

  async function requestLink(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/api/exhibitor-manager-sessions/request", { email });
      setMessage(m.manager_sent());
    } catch {
      setMessage(m.manager_error());
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await api("/api/exhibitor-manager-sessions/sign-out", {});
      setRows(null);
      setMessage("");
    } catch {
      setMessage(m.manager_error());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="site-container mx-auto flex w-full max-w-account flex-col gap-4 py-12">
      <h1>{m.manager_title()}</h1>
      {message && <p role="status">{message}</p>}
      {rows === null ? (
        <form onSubmit={requestLink} className="flex flex-col gap-4">
          <PublicLabel htmlFor="manager-email">{m.manager_email()}</PublicLabel>
          <PublicInput
            id="manager-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" disabled={busy}>
            {m.manager_request()}
          </Button>
        </form>
      ) : (
        <>
          {rows.length === 0 && <p>{m.manager_empty()}</p>}
          <ul>
            {rows.map((row) => (
              <li key={row.id}>{row.name}</li>
            ))}
          </ul>
          <Button disabled={busy} onClick={signOut}>
            {m.manager_sign_out()}
          </Button>
        </>
      )}
    </section>
  );
}
