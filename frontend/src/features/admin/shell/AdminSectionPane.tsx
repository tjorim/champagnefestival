import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import SuspenseWithBoundary from "@/components/SuspenseWithBoundary";
import { m } from "@/paraglide/messages";
import AdminSkeleton, { skeletonVariantForSection } from "./AdminSkeleton";

/** The dashboard keys this pane by section so failures cannot block navigation. */
export default function AdminSectionPane({
  section,
  children,
}: {
  section: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-content-pane">
      <SuspenseWithBoundary
        fallback={<AdminSkeleton variant={skeletonVariantForSection(section)} />}
        errorFallback={
          <Alert variant="danger" className="text-content">
            <p>{m.admin_section_load_error()}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              {m.admin_reload_page()}
            </Button>
          </Alert>
        }
      >
        {children}
      </SuspenseWithBoundary>
    </div>
  );
}
