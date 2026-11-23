import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { ActiveEdition } from "@/hooks/useActiveEdition";
import type { Registration } from "@/types/registration";
import type { useAdminQueries } from "./useAdminQueries";

interface AdminWorkspace {
  queries: ReturnType<typeof useAdminQueries>;
  activeEdition: ActiveEdition;
  activeEditionLoaded: boolean;
  canManageAdminSections: boolean;
  applyActiveEditionFilterRequest: number;
  detailRegistration: Registration | null;
  setDetailRegistration: Dispatch<SetStateAction<Registration | null>>;
  registrationError: string;
  setRegistrationError: Dispatch<SetStateAction<string>>;
}

export const AdminWorkspaceContext = createContext<AdminWorkspace | null>(null);

export function useAdminWorkspace(): AdminWorkspace {
  const workspace = useContext(AdminWorkspaceContext);
  if (!workspace) throw new Error("Admin sections require an admin workspace");
  return workspace;
}
