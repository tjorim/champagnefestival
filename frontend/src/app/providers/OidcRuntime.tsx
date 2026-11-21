import { useEffect } from "react";
import { AuthProvider, useAuth, type AuthContextProps } from "react-oidc-context";
import { createOidcConfig } from "@/config/oidcRuntime";

function Bridge({ onReady }: { onReady: (auth: AuthContextProps) => void }) {
  const auth = useAuth();
  useEffect(() => {
    if (!auth.isLoading) onReady(auth);
  }, [auth, onReady]);
  return null;
}

export default function OidcRuntime({
  navigateTo,
  onReady,
}: {
  navigateTo: (to: string) => void | Promise<void>;
  onReady: (auth: AuthContextProps) => void;
}) {
  return (
    <AuthProvider {...createOidcConfig({ navigateTo })}>
      <Bridge onReady={onReady} />
    </AuthProvider>
  );
}
