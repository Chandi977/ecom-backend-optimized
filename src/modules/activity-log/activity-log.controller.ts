import { Response } from 'express';
import { FilterQuery } from 'mongoose';
import ActivityLog, { IActivityLogDocument } from './activity-log.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';
import { logger } from '../../utils/logger';

const parseIntOr = (value: unknown, fallback: number): number => {
  const parsed = parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Build a Mongo filter shared by the list and summary endpoints.
const buildFilter = (query: Record<string, unknown>): FilterQuery<IActivityLogDocument> => {
  const filter: FilterQuery<IActivityLogDocument> = {};

  if (query.userId) filter.userId = String(query.userId);
  if (query.role) filter.userRole = String(query.role);
  if (query.method) filter.method = String(query.method).toUpperCase();
  if (query.route) filter.route = { $regex: String(query.route), $options: 'i' };
  if (query.resourceType) filter.resourceType = String(query.resourceType);
  if (query.status) filter.statusCode = parseIntOr(query.status, 0);
  if (query.success === 'true') filter.success = true;
  if (query.success === 'false') filter.success = false;
  // "writes=true" focuses the audit trail on who-changed-what (excludes reads).
  if (query.writes === 'true') filter.method = { $ne: 'GET' } as never;

  if (query.from || query.to) {
    const createdAt: Record<string, Date> = {};
    if (query.from) createdAt.$gte = new Date(String(query.from));
    if (query.to) createdAt.$lte = new Date(String(query.to));
    filter.createdAt = createdAt;
  }

  return filter;
};

// GET /activity/logs — paginated, filterable audit trail.
export const getActivityLogs = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const skip = parseIntOr(req.query.skip, 0);
    const limit = Math.min(parseIntOr(req.query.limit, 20), 200);
    const filter = buildFilter(req.query as Record<string, unknown>);

    const [data, total] = await Promise.all([
      ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      ActivityLog.countDocuments(filter),
    ]);

    res.status(200).json(commonResponse('Activity logs fetched', true, { items: data, total }));
  } catch (error) {
    logger.error('getActivityLogs error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal server error.', false));
  }
};

// GET /activity/summary — aggregated observability metrics over a time window.
export const getActivitySummary = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const filter = buildFilter(req.query as Record<string, unknown>);
    // Default window: last 7 days when none supplied.
    if (!filter.createdAt) {
      filter.createdAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    }

    const [overall, topEndpoints, callsOverTime, topUsers, byStatusClass, byRole] = await Promise.all([
      ActivityLog.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            errorCount: { $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] } },
            avgDurationMs: { $avg: '$durationMs' },
            maxDurationMs: { $max: '$durationMs' },
          },
        },
      ]),
      ActivityLog.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { route: '$route', method: '$method' },
            calls: { $sum: 1 },
            avgDurationMs: { $avg: '$durationMs' },
            errorCount: { $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] } },
          },
        },
        { $sort: { calls: -1 } },
        { $limit: 20 },
      ]),
      ActivityLog.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } },
            calls: { $sum: 1 },
            errorCount: { $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      ActivityLog.aggregate([
        { $match: { ...filter, userId: { $ne: null } } },
        {
          $group: {
            _id: { userId: '$userId', role: '$userRole' },
            calls: { $sum: 1 },
          },
        },
        { $sort: { calls: -1 } },
        { $limit: 10 },
      ]),
      ActivityLog.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $concat: [{ $toString: { $floor: { $divide: ['$statusCode', 100] } } }, 'xx'] },
            calls: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // Role-wise breakdown: total calls vs. write (mutation) actions per role.
      ActivityLog.aggregate([
        { $match: { ...filter, userRole: { $ne: null } } },
        {
          $group: {
            _id: '$userRole',
            calls: { $sum: 1 },
            writes: { $sum: { $cond: [{ $ne: ['$method', 'GET'] }, 1, 0] } },
            errorCount: { $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] } },
          },
        },
        { $sort: { writes: -1, calls: -1 } },
      ]),
    ]);

    const summary = overall[0] || { totalCalls: 0, errorCount: 0, avgDurationMs: 0, maxDurationMs: 0 };
    const errorRate = summary.totalCalls ? summary.errorCount / summary.totalCalls : 0;

    res.status(200).json(
      commonResponse('Activity summary fetched', true, {
        overall: { ...summary, errorRate },
        topEndpoints,
        callsOverTime,
        topUsers,
        byStatusClass,
        byRole,
      })
    );
  } catch (error) {
    logger.error('getActivitySummary error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal server error.', false));
  }
};
