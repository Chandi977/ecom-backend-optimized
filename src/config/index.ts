import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  trustProxy: process.env.TRUST_PROXY || 'false',

  mongodb: {
    uri: process.env.MONGODB_URI || '',
    dnsServers: (process.env.DB_DNS_SERVERS || '').split(',').filter(Boolean),
    serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT_MS || '10000', 10),
  },

  jwt: {
    secret: process.env.SECRET || 'default-secret',
  },

  aws: {
    bucketName: process.env.AWS_BUCKET_NAME || '',
    region: process.env.AWS_BUCKET_REGION || '',
    accessKey: process.env.AWS_ACCESS_KEY || '',
    secretKey: process.env.AWS_SECRET_KEY || '',
    // Optional CloudFront/CDN domain that fronts the image bucket, e.g.
    // "dxxxx.cloudfront.net" or "images.prempackaging.com". When set, image URLs
    // are served as plain CDN URLs (edge-cached, no per-request signing). When
    // empty (default), the app keeps generating presigned S3 URLs.
    cdnDomain: (process.env.CDN_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },

  brevo: {
    apiKey: process.env.BREVO_API || '',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    // DEV-ONLY: when true, orders may be marked paid without a real Razorpay
    // payment. This raw flag is opt-in; the order controller additionally
    // requires TEST keys (rzp_test_) before it takes effect, so it can never
    // fire against live keys even if this is accidentally left on.
    allowPaymentBypass: process.env.ALLOW_PAYMENT_BYPASS === 'true',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    webClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
    androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '',
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // Distributed lock helper + runtime deadlock/contention analyzer.
  // Locks are defense-in-depth and fail-open: a Redis outage never blocks
  // checkout (see src/utils/concurrency/lock.ts). Toggle off to disable entirely.
  concurrency: {
    lockEnabled: process.env.CONCURRENCY_LOCK_ENABLED !== 'false',
    analyzerEnabled: process.env.CONCURRENCY_ANALYZER_ENABLED !== 'false',
    lockTtlMs: parseInt(process.env.CONCURRENCY_LOCK_TTL_MS || '30000', 10),
    lockWaitMs: parseInt(process.env.CONCURRENCY_LOCK_WAIT_MS || '5000', 10),
  },

  // Firebase Cloud Messaging service-account credentials for mobile push.
  // Leave empty to keep push disabled (the in-app feed still works). When all
  // three are set, push.service activates FCM via the optional firebase-admin dep.
  fcm: {
    projectId: process.env.FCM_PROJECT_ID || '',
    clientEmail: process.env.FCM_CLIENT_EMAIL || '',
    privateKey: process.env.FCM_PRIVATE_KEY || '',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '1200', 10),
  },

  logging: {
    dir: process.env.LOG_DIR || './logs',
    errorLogFile: process.env.ERROR_LOG_FILE || 'error.log',
  },
};
