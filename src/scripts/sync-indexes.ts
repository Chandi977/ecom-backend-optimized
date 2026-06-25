/**
 * Controlled index migration.
 *
 * `autoIndex` is disabled app-wide (see src/database/index.ts), so the schema
 * index definitions are NOT applied automatically. Run this script deliberately
 * (e.g. during a maintenance window) to bring the database in line with the
 * schemas:
 *
 *   npm run build && npm run sync:indexes
 *   # or, without building:  npx ts-node src/scripts/sync-indexes.ts
 *
 * `syncIndexes()` creates any missing indexes AND drops indexes that are no
 * longer declared in the schema. On large collections index builds can be
 * expensive — run with care.
 */
import mongoose from 'mongoose';
import { DBconnection } from '../database';
import { logger } from '../utils/logger';
import * as models from '../models';

const run = async (): Promise<void> => {
  await DBconnection();

  // Re-enable index operations for this one-off process only.
  mongoose.set('autoIndex', true);

  const entries = Object.entries(models) as Array<[string, mongoose.Model<unknown>]>;
  for (const [name, model] of entries) {
    if (!model || typeof model.syncIndexes !== 'function') continue;
    try {
      const start = Date.now();
      await model.syncIndexes();
      const indexes = await model.listIndexes();
      logger.info(`[syncIndexes] ${name}: ${indexes.length} indexes (${Date.now() - start}ms)`);
    } catch (error) {
      logger.error(`[syncIndexes] ${name} failed`, {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }
};

run()
  .then(async () => {
    logger.info('[syncIndexes] Completed');
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('[syncIndexes] Aborted', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    await mongoose.disconnect();
    process.exit(1);
  });
