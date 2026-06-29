import { Response, NextFunction } from 'express';
import { commonResponse } from '../utils/response';
import { IAuthRequest } from '../types';
import { roleCan } from '../config/rbac';

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
