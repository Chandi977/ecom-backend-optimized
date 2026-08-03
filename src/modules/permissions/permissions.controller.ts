import { Response } from 'express';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';
import { ROLE_LABELS, isFullAccessRole, permissionsForRole } from '../../config/rbac';
import { logger } from '../../utils/logger';

// GET /permissions/me — the admin UI asks the server for its effective permission
// list instead of hardcoding the role matrix. Full-access roles report the complete
// catalog so a client-side can() against the raw list still answers true for them.
export const getMyPermissions = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.userRole;
    if (!role) {
      res.status(401).json(commonResponse('Access denied. No authenticated role.', false));
      return;
    }

    res.status(200).json(
      commonResponse('Permissions fetched', true, {
        role,
        label: ROLE_LABELS[role] || role,
        fullAccess: isFullAccessRole(role),
        permissions: permissionsForRole(role),
      })
    );
  } catch (error) {
    logger.error('getMyPermissions error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal server error.', false));
  }
};
