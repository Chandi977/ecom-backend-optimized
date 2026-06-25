import mongoose from 'mongoose';
import dns from 'dns';
import { config } from '../config';
import { logger } from '../utils/logger';

// Do NOT build/sync indexes automatically on model registration. Index changes
// are applied deliberately via `npm run sync:indexes`, so the running app never
// triggers a (potentially blocking) index build against the live database.
mongoose.set('autoIndex', false);

mongoose.connection.on('disconnected', () => {
  logger.warn('Database disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('Database reconnected');
});

mongoose.connection.on('error', (error: Error) => {
  logger.error('Database connection error event', { error: error.message });
});

const configureDnsForDb = (): void => {
  if (config.mongodb.dnsServers.length === 0) return;

  try {
    dns.setServers(config.mongodb.dnsServers);
    logger.info('Custom DNS servers set for database resolution', {
      dnsServers: config.mongodb.dnsServers,
    });
  } catch (error) {
    logger.error('Invalid DB_DNS_SERVERS configuration', {
      dnsServers: config.mongodb.dnsServers,
      error,
    });
    throw error;
  }
};

export const DBconnection = async (): Promise<typeof mongoose.connection> => {
  if (!config.mongodb.uri) {
    const error = new Error('MONGODB_URI is not configured');
    logger.error('Database connection failed', { error: error.message });
    throw error;
  }

  try {
    configureDnsForDb();
    await mongoose.connect(config.mongodb.uri, {
      serverSelectionTimeoutMS: config.mongodb.serverSelectionTimeoutMS,
    });
    logger.info('Database connected successfully');
    return mongoose.connection;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Database connection failed', { error: message });
    throw err;
  }
};
