import { Response, NextFunction } from 'express';
import { commonResponse } from '../utils/response';
import { IAuthRequest } from '../types';
import { roleCan } from '../config/rbac';
import { logger } from '../utils/logger';

/**
 * Permission gate. Must run AFTER `adminMiddleware` (which verifies the token and sets
 * `req.userRole`). Full-access roles bypass; restricted roles must hold ALL of the
 * required permissions, otherwise the request is rejected with 403.
 *
 * Usage: router.put('/product/update', adminMiddleware, authorize('product:update'), ...)
 */
export const authorize = (...required: string[]) =>
  (req: IAuthRequest, res: Response, next: NextFunction): void => {
    const role = req.userRole;

    if (!role) {
      res.status(401).json(commonResponse('Access denied. No authenticated role.', false));
      return;
    }

    const allowed = required.every((permission) => roleCan(role, permission));
    if (!allowed) {
      res.status(403).json(commonResponse('Access denied. Insufficient permissions for this action.', false));
      return;
    }

    next();
  };

/**
 * One alternative way to pass a gate. `permissions` are ALL required; when `fields`
 * is present the grant is "scoped" — the request is admitted but `req.body` is
 * reduced to that whitelist first.
 */
export interface IScopedGrant {
  permissions: string[];
  fields?: string[];
}

/**
 * Field-scoped permission gate — the mechanism behind the `seo` role.
 *
 * Grants are tried in order and the FIRST one the role satisfies wins:
 *   1. no `req.userRole`                       -> 401
 *   2. role satisfies an unrestricted grant    -> next(), body untouched
 *   3. role satisfies a scoped grant (`fields`)-> `req.body` is replaced with only
 *                                                 those keys, then next()
 *   4. no grant satisfied                      -> 403
 *
 * Because a role holding the unrestricted permission matches grant 1, `general`,
 * `catalog-manager`, `admin` and `manager` are never narrowed — only a role that
 * relies on the scoped grant is. Keep this BEFORE `validate(...)` in the chain
 * (adminMiddleware, authorizeScoped(...), validate(...), handler) so zod parses
 * the already-filtered body.
 *
 * Usage:
 *   authorizeScoped(
 *     { permissions: ['product:update'] },
 *     { permissions: ['seo:write'], fields: SEO_PRODUCT_FIELDS },
 *   )
 */
export const authorizeScoped = (...grants: IScopedGrant[]) =>
  (req: IAuthRequest, res: Response, next: NextFunction): void => {
    const role = req.userRole;

    if (!role) {
      res.status(401).json(commonResponse('Access denied. No authenticated role.', false));
      return;
    }

    const grant = grants.find((candidate) =>
      candidate.permissions.every((permission) => roleCan(role, permission)));

    if (!grant) {
      res.status(403).json(commonResponse('Access denied. Insufficient permissions for this action.', false));
      return;
    }

    // Unrestricted grant — the caller may send the whole payload.
    if (!grant.fields) {
      next();
      return;
    }

    const allowedFields = grant.fields;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};
    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) filtered[field] = body[field];
    });

    // Log what was thrown away — a silently ignored edit is otherwise very hard to
    // debug from the admin UI, which gets a 200 back either way.
    const dropped = Object.keys(body).filter((key) => !Object.prototype.hasOwnProperty.call(filtered, key));
    if (dropped.length > 0) {
      logger.info('authorizeScoped narrowed request body to the role field scope', {
        role,
        method: req.method,
        route: req.originalUrl,
        kept: Object.keys(filtered),
        dropped,
      });
    }

    req.body = filtered;
    next();
  };
