import { createContext, useContext } from "react";
import type { AdminSession } from "../../shared/admin.js";
export const AdminContext = createContext<{
  session: AdminSession;
  refresh: () => Promise<void>;
} | null>(null);
export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) throw new Error("Admin context ausente.");
  return context;
}
export function usePermission(permission: string) {
  const { session } = useAdmin();
  return (
    session.user.permissions.includes("*") ||
    session.user.permissions.includes(permission)
  );
}
