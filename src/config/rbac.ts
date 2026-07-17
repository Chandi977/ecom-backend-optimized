/**
 * Role-Based Access Control (RBAC) configuration.
 *
 * The historical auth model is binary: `adminMiddleware` only blocks `role === 'user'`
 * and lets every other role write everything. This module introduces a granular
 * permission layer used by the `authorize()` middleware on write routes.
 *
 * Full-access roles bypass all permission checks (preserves current behavior for the
 * roles already in use). Restricted roles only get the permissions listed below.
 */

// The only full-access roles with unrestricted write access.
export const FULL_ACCESS_ROLES = ['admin'];

// Restricted roles -> the exact write permissions they are granted.
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  'catalog-manager': [
    // Full CRUD on catalog entities.
    'brand:read', 'brand:write',
    'category:create', 'category:read', 'category:update', 'category:delete',
    'subcategory:create', 'subcategory:read', 'subcategory:update', 'subcategory:delete',
    'product:create', 'product:read', 'product:update', 'product:delete',
    // Manage notification templates and send custom notifications.
    'notification:read', 'notification:write',
    // View admin/catalog-manager activity observability and audit logs.
    'analytics:read',
  ],
};

export const isFullAccessRole = (role?: string): boolean =>
  !!role && FULL_ACCESS_ROLES.includes(role);

/**
 * Returns true if the given role is allowed to perform the given permission.
 * Full-access roles are always allowed; restricted roles only if explicitly granted.
 */
export const roleCan = (role: string | undefined, permission: string): boolean => {
  if (!role) return false;
  if (isFullAccessRole(role)) return true;
  const perms = ROLE_PERMISSIONS[role];
  return !!perms && perms.includes(permission);
};
