// config/permissions.ts
// Single source of truth for role-based permissions across the Trustee Operations Portal.
// Every UI check and server-side enforcement must import from this file.
// No hardcoded role checks anywhere else in the codebase.

export type Role = "RECEPTION_ADMIN" | "TRUSTEE_OFFICER" | "TRUSTEE_MANAGER" | "ADMIN" | "CLIENT" | "AGENT" | "ACCOUNTANT";

export type Action =
  | "createCase"
  | "uploadDocument"
  | "assignCase"
  | "verifyDocument"
  | "approveCase"
  | "returnCase"
  | "cancelCase"
  | "manageFees"
  | "submitDLD"
  | "manageUsers"
  | "viewFeedback"
  | "manageFeedback"
  | "viewAuditLog"
  | "manageBranches"
  | "applyAdvisory"
  | "rollbackAdvisory"
  | "previewDocument"
  | "branchSwitch"
  | "manageCatalog"
  | "viewDashboard"
  | "manageConfig"
  // IDP — Intelligent Document Processing
  | "viewIdpResults"
  | "manageIdpExtraction"
  | "resolveIdpFlag";

export const PERMISSIONS: Record<Action, Role[]> = {
  createCase:        ["RECEPTION_ADMIN", "TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN"],
  assignCase:        ["TRUSTEE_MANAGER", "ADMIN"],
  approveCase:       ["TRUSTEE_MANAGER", "ADMIN"],
  returnCase:        ["TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN"],
  cancelCase:        ["ADMIN"],
  submitDLD:         ["TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN"],
  uploadDocument:    ["RECEPTION_ADMIN", "TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN"],
  verifyDocument:    ["TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN"],
  previewDocument:   ["TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN", "RECEPTION_ADMIN"],
  manageFees:        ["TRUSTEE_MANAGER", "ADMIN", "ACCOUNTANT"],
  manageUsers:       ["ADMIN"],
  manageBranches:    ["ADMIN"],
  manageCatalog:     ["TRUSTEE_MANAGER", "ADMIN"],
  manageConfig:      ["TRUSTEE_MANAGER", "ADMIN"],
  viewAuditLog:      ["TRUSTEE_MANAGER", "ADMIN"],
  // IDP — Intelligent Document Processing
  viewIdpResults:      ["RECEPTION_ADMIN", "TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN", "ACCOUNTANT", "AGENT", "CLIENT"],
  manageIdpExtraction: ["TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN"],
  resolveIdpFlag:       ["TRUSTEE_MANAGER", "ADMIN"],
  branchSwitch:      ["ADMIN"],
  viewFeedback:      ["TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN"],
  manageFeedback:    ["TRUSTEE_MANAGER", "ADMIN"],
  applyAdvisory:     ["TRUSTEE_MANAGER", "ADMIN"],
  rollbackAdvisory:  ["ADMIN"],
  viewDashboard:     ["RECEPTION_ADMIN", "TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN", "CLIENT", "ACCOUNTANT"],
};

export function can(role: string | undefined, action: Action): boolean {
  if (!role) return false;
  return PERMISSIONS[action].includes(role as Role);
}

export function getRolePermissions(role: Role): Action[] {
  return (Object.keys(PERMISSIONS) as Action[]).filter(action =>
    PERMISSIONS[action].includes(role)
  );
}

export function getActionRoles(action: Action): Role[] {
  return PERMISSIONS[action];
}

export function getPermissionMatrix(): Record<Action, Record<Role, boolean>> {
  const allRoles: Role[] = ["RECEPTION_ADMIN", "TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN", "ACCOUNTANT"];
  const result = {} as Record<Action, Record<Role, boolean>>;
  for (const action of Object.keys(PERMISSIONS) as Action[]) {
    result[action] = {} as Record<Role, boolean>;
    for (const role of allRoles) {
      result[action][role] = PERMISSIONS[action].includes(role);
    }
  }
  return result;
}
