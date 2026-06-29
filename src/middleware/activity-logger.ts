import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import ActivityLog from '../modules/activity-log/activity-log.model';
import { logger } from '../utils/logger';

// ACTIVITY_LOG_LEVEL controls write volume:
//   'off'       -> disabled
//   'mutations' -> (default) non-GET requests, any error, or any authenticated request
//   'all'       -> every request
const LOG_LEVEL = (process.env.ACTIVITY_LOG_LEVEL || 'mutations').toLowerCase();

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const NUMERIC_RE = /^\d+$/;

// Collapse volatile path segments (ids, slugs) into ':id' so calls group by route.
const normalizeRoute = (path: string): string =>
  path
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      if (OBJECT_ID_RE.test(segment) || NUMERIC_RE.test(segment)) return ':id';
      // Long opaque tokens (e.g. slugs / codes) — treat as a parameter too.
      if (segment.length > 24) return ':id';
      return segment;
    })
    .join('/');

// Try to extract a human-readable entity name from the request body.
const extractEntityName = (body: Record<string, unknown>): string | undefined => {
  const candidate =
    body.name || body.title || body.product_name || body.category_name || body.brand_name
    || body.label || body.couponCode || body.orderId || body.code || body.email_address;
  return candidate ? String(candidate).substring(0, 120) : undefined;
};

// For unauthenticated requests, try to capture who the request is about
// (e.g., email from contact form / signup) so the audit trail shows a name.
const extractFallbackUserIdentity = (req: IAuthRequest): string | undefined => {
  const body = (req.body || {}) as Record<string, unknown>;
  const email = body.email_address || body.email;
  if (email && typeof email === 'string') return String(email).substring(0, 80);
  const phone = body.mobile_number || body.phone;
  if (phone && typeof phone === 'string') return String(phone).substring(0, 20);
  return undefined;
};

// List the fields being changed (for PUT/PATCH).
const extractChangedFields = (body: Record<string, unknown>): string[] | undefined => {
  const keys = Object.keys(body).filter((k) => !['_id', 'id', '__v'].includes(k));
  return keys.length > 0 ? keys : undefined;
};

// Derive a human "who did what" label, the entity type, the target id, and a detail
// summary from a request.
const deriveAction = (
  req: IAuthRequest
): { action: string; resourceType: string; resourceId?: string; detail?: string } => {
  const segments = req.path
    .split('/')
    .filter(Boolean)
    .filter((s) => s !== 'premind' && s !== 'api' && !/^v\d+$/i.test(s));

  const resourceType = segments[0] || '';
  const rest = segments.slice(1);
  const last = rest[rest.length - 1] || '';

  let verb: string;
  if (rest.includes('search')) verb = 'Searched';
  else if (rest.includes('filter')) verb = 'Filtered';
  else if (req.method === 'GET') verb = 'Viewed';
  else if (last === 'delete' || req.method === 'DELETE') verb = 'Deleted';
  else if (last === 'create' || req.method === 'POST') verb = 'Created';
  else if (req.method === 'PUT' || req.method === 'PATCH' || rest.includes('update')) verb = 'Updated';
  else verb = req.method;

  const action = resourceType ? `${verb} ${resourceType}` : verb;

  const body = (req.body || {}) as Record<string, unknown>;
  let rawId: unknown = body.id ?? body._id ?? (req.params as Record<string, unknown>)?.id;
  if (rawId == null) {
    rawId = rest.find((s) => /^[a-f0-9]{24}$/i.test(s) || /^\d+$/.test(s));
  }

  let resourceId: string | undefined;
  if (rawId != null && rawId !== '') {
    resourceId = Array.isArray(rawId) ? rawId.join(',') : String(rawId);
    if (resourceId.length > 200) resourceId = `${resourceId.slice(0, 200)}…`;
  }

  // Build a human-readable detail summary.
  let detail: string | undefined;
  const label = resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
  const entityName = extractEntityName(body);

  if (verb === 'Created') {
    detail = entityName ? `Created ${resourceType} "${entityName}"` : `Created ${label}`;
  } else if (verb === 'Updated') {
    const fields = extractChangedFields(body);
    if (entityName) {
      detail = `Updated ${resourceType} "${entityName}"`;
      if (fields && fields.length <= 5) detail += ` (${fields.join(', ')})`;
    } else if (resourceId) {
      detail = `Updated ${label} #${resourceId.substring(0, 8)}`;
      if (fields && fields.length <= 5) detail += ` (${fields.join(', ')})`;
    } else {
      detail = `Updated ${label}`;
    }
  } else if (verb === 'Deleted') {
    detail = entityName ? `Deleted ${resourceType} "${entityName}"` : `Deleted ${label}`;
  } else if (verb === 'Viewed') {
    detail = entityName ? `Viewed ${resourceType} "${entityName}"` : undefined;
  } else if (verb === 'Searched') {
    const q = String(body.query || body.search || body.q || '');
    detail = q ? `Searched ${resourceType} for "${q}"` : `Searched ${label}`;
  }

  return { action, resourceType, resourceId, detail };
};

const shouldSkip = (path: string): boolean =>
  path === '/' || path.startsWith('/premind/health') || path.includes('/health');

const shouldLog = (req: IAuthRequest, statusCode: number): boolean => {
  if (LOG_LEVEL === 'off') return false;
  if (req.method === 'OPTIONS') return false;
  if (LOG_LEVEL === 'all') return true;
  // 'mutations' default: capture writes, errors, and anything an authenticated user did.
  return req.method !== 'GET' || statusCode >= 400 || !!req.user;
};

/**
 * Records every API call (audit trail + observability) without blocking the response.
 * Reads req.user / req.userRole in the `finish` handler, by which point the route's
 * auth middleware has already populated them. Inserts are fire-and-forget.
 */
export const activityLogger = (
  req: IAuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (shouldSkip(req.path)) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    try {
      if (!shouldLog(req, res.statusCode)) return;

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const { action, resourceType, resourceId, detail } = deriveAction(req);

      // Fire-and-forget — never let logging failures affect the request lifecycle.
      void ActivityLog.create({
        method: req.method,
        path: req.path,
        route: normalizeRoute(req.path),
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        success: res.statusCode < 400,
        action,
        resourceType,
        resourceId,
        detail,
        userId: req.user,
        userRole: req.userRole,
        userName: req.userName || extractFallbackUserIdentity(req),
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }).catch((error) => {
        logger.warn('activity-log insert failed', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      });
    } catch (error) {
      logger.warn('activity-logger error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  });

  next();
};
