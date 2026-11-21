import React from "react";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import SuspenseWithBoundary from "@/components/SuspenseWithBoundary";
import { m } from "@/paraglide/messages";

interface AppSuspenseProps {
  children: React.ReactNode;
  errorFallbackText: string;
}

export function AppSuspense({ children, errorFallbackText }: AppSuspenseProps) {
  return (
    <SuspenseWithBoundary
      fallback={
        <div className="text-center p-6">
          <Spinner label={m.loading()} variant="light" />
        </div>
      }
      errorFallback={
        <Alert variant="danger" className="m-6 text-center">
          {errorFallbackText}
        </Alert>
      }
    >
      {children}
    </SuspenseWithBoundary>
  );
}
