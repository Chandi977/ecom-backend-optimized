/**
 * Role-Based Access Control (RBAC) configuration.
 *
 * Five roles reach the admin panel; `adminMiddleware` rejects the storefront
 * customer role (`user`) before any of this runs.
 *
 *   admin / manager  — FULL ACCESS. Short-circuit every permission check, so they
 *                      are deliberately absent from ROLE_PERMISSIONS below.
 *   general          — operations + catalog: orders, leads, stock, products,
 *                      categories, reviews, coupons, pincodes. No staff-account
 *                      management, no promotional email, no app-version releases.
 *   seo              — read-only catalog + SEO fields only. Holds `seo:write` but
 *                      NOT product/category/subcategory `:update`, so the update
 *                      endpoints admit it through `authorizeScoped()` and strip
 *                      everything outside SEO_*_FIELDS from the request body. That
 *                      is what keeps price, stock, GST, images and names read-only.
 *   catalog-manager  — LEGACY. Its permission list is frozen; extend `general`
 *                      instead of touching it.
 *
 * Permission strings are `domain:action`. `authorize(...)` requires ALL of the
 * listed permissions; `authorizeScoped(...)` additionally narrows `req.body` to a
 * field whitelist when the role only satisfies a scoped grant.
 */

// The only full-access roles with unrestricted write access.
export const FULL_ACCESS_ROLES = ['admin', 'manager'];

// Every role allowed into the admin panel at all — i.e. everything except the
// storefront customer role `user`.
export const ADMIN_PANEL_ROLES = ['admin', 'manager', 'general', 'seo', 'catalog-manager'];

// Human-readable role names, shared with the admin UI via GET /permissions/me.
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  general: 'General',
  seo: 'SEO',
  'catalog-manager': 'Catalog Manager',
  user: 'Customer',
};

// The complete catalog of known permission strings. Full-access roles are
// reported as holding all of these (see permissionsForRole) so a client-side
// `can()` against the raw list still answers true for them.
export const ALL_PERMISSIONS = [
  'analytics:read',
  'appversion:write',
  'attribute:write',
  'brand:read', 'brand:write',
  'category:create', 'category:read', 'category:update', 'category:delete',
  'contact:write',
  'coupon:write',
  // List/inspect storefront CUSTOMERS (distinct from user:read, which covers
  // admin/staff accounts). Gates the customer list, stats and search routes.
  'customer:read',
  'deal:write',
  // View leads / enquiries / contact submissions.
  'lead:read',
  'marketing:read', 'marketing:write',
  'notification:read', 'notification:write',
  // Read the order list/detail vs. mutate an order.
  'order:read', 'order:write',
  // Create/update serviceable pincodes and freight rates.
  'pincode:write',
  'product:create', 'product:read', 'product:update', 'product:delete',
  'review:read', 'review:moderate',
  // View SEO fields + dashboard vs. edit the SEO-only fields (field-scoped).
  'seo:read', 'seo:write',
  'subcategory:create', 'subcategory:read', 'subcategory:update', 'subcategory:delete',
  // List admin/staff accounts vs. create/modify them.
  'user:read', 'user:write',
  'variant:create', 'variant:update', 'variant:delete',
];

// Restricted roles -> the exact permissions they are granted. Full-access roles
// are intentionally not listed here; they bypass the lookup entirely.
//
// `marketing:*` and `appversion:write` are granted to no restricted role, so the
// Promotional Email tools and app-version releases stay admin/manager-only until
// explicitly delegated here.
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  general: [
    // Full CRUD on catalog entities.
    'brand:read', 'brand:write',
    'category:create', 'category:read', 'category:update', 'category:delete',
    'subcategory:create', 'subcategory:read', 'subcategory:update', 'subcategory:delete',
    'product:create', 'product:read', 'product:update', 'product:delete',
    'variant:create', 'variant:update', 'variant:delete',
    'attribute:write',
    // Day-to-day operations: fulfil orders, work the lead pipeline, answer tickets.
    'order:read', 'order:write',
    'lead:read', 'contact:write',
    'customer:read',
    // Moderate customer product reviews (approve / reject / reply / delete).
    'review:read', 'review:moderate',
    // Manage notification templates and send custom notifications.
    'notification:read', 'notification:write',
    // Merchandising + serviceability.
    'coupon:write', 'deal:write',
    'pincode:write',
    // Holds seo:write too, but also product/category/subcategory :update, so
    // authorizeScoped always matches its unrestricted grant first (no narrowing).
    'seo:read', 'seo:write',
    // Activity observability, audit logs and the ops dashboard.
    'analytics:read',
  ],
  seo: [
    // Read-only across the catalog — no create/update/delete on the entities
    // themselves, which is what stops price/stock/GST/image/name edits.
    'product:read', 'category:read', 'subcategory:read', 'brand:read',
    // The SEO fields themselves, enforced field-by-field by authorizeScoped.
    'seo:read', 'seo:write',
    // The SEO dashboard.
    'analytics:read',
  ],
  // LEGACY — frozen. Predates the general/seo split; kept byte-for-byte so
  // existing catalog-manager accounts behave exactly as they did before.
  'catalog-manager': [
    // Full CRUD on catalog entities.
    'brand:read', 'brand:write',
    'category:create', 'category:read', 'category:update', 'category:delete',
    'subcategory:create', 'subcategory:read', 'subcategory:update', 'subcategory:delete',
    'product:create', 'product:read', 'product:update', 'product:delete',
    // Manage notification templates and send custom notifications.
    'notification:read', 'notification:write',
    // Moderate customer product reviews (approve / reject / reply / delete).
    'review:read', 'review:moderate',
    // View admin/catalog-manager activity observability and audit logs.
    'analytics:read',
    // READ-ONLY additions, not a widening: this role's menu has always shown
    // Orders / Enquiries / Leads / Users, and those routes were reachable only
    // because they carried no authorize() gate. Now that they do, the grants
    // have to be explicit or the role's existing pages would start 403ing.
    'order:read',
    'lead:read',
    'customer:read',
  ],
};

// --- Field scopes for authorizeScoped() -------------------------------------
// Verified against the live zod update schemas in utils/validators/zod-schemas.ts,
// so every key below actually survives validate() after the body is narrowed.
// Anything NOT listed here is dropped from a seo-role request.

// updateProductSchema keys that are SEO-owned. `seo` is the SEO sidecar object
// (seoInputSchema: meta_title/meta_description/overview_fields/canonical/
// schema_markup/keywords). `id` must stay or the handler cannot find the product.
export const SEO_PRODUCT_FIELDS = [
  'id', 'slug', 'meta_title', 'meta_description', 'overview_fields', 'seo',
];

// updateCategorySchema has no `slug` key — do not add one.
export const SEO_CATEGORY_FIELDS = [
  'id', 'meta_title', 'meta_description', 'overview_fields',
];

// updateSubCategorySchema has no `slug`/`meta_*` keys — `seo_content` is the
// authored SEO copy + FAQ block rendered under every product in the sub-category.
export const SEO_SUBCATEGORY_FIELDS = [
  'id', 'seo_content',
];

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

/**
 * The effective permission list for a role — what GET /permissions/me reports.
 * Full-access roles resolve to the complete catalog rather than an empty array,
 * so a client mirroring this list does not have to special-case them.
 */
export const permissionsForRole = (role?: string): string[] => {
  if (!role) return [];
  if (isFullAccessRole(role)) return [...ALL_PERMISSIONS];
  return [...(ROLE_PERMISSIONS[role] || [])];
};
