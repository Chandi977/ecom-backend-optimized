import { Worker, ConnectionOptions } from 'bullmq';
import { config } from '../config';
import { sendEmail } from '../utils/mailer';
import { logger } from '../utils/logger';
import { bullConnection } from '../utils/redis';

const connection: ConnectionOptions = bullConnection as ConnectionOptions;

const buildVerificationHtml = (token: string): string => `
  <h2>Email Verification</h2>
  <p>Your verification OTP is: <strong>${token}</strong></p>
  <p>This OTP expires in 1 hour.</p>
`;

const buildWelcomeHtml = (name: string): string => `
  <h2>Welcome to Prem Industries!</h2>
  <p>Dear ${name},</p>
  <p>Thank you for registering with us.</p>
`;

const buildForgotPasswordHtml = (otp: string): string => `
  <h2>Password Reset OTP</h2>
  <p>Your OTP is: <strong>${otp}</strong></p>
  <p>This OTP expires in 10 minutes.</p>
`;

const buildOrderHtml = (subject: string, order: Record<string, unknown>): string => `
  <h2>${subject}</h2>
  <p>Order ID: ${order.orderId || order._id}</p>
  <p>Status: ${order.status}</p>
  <p>Total: ₹${order.totalOrderValue}</p>
`;

const buildBackInStockHtml = (): string => `
  <h2>Back in Stock</h2>
  <p>A product you were interested in is back in stock.</p>
`;

const emailHandlers: Record<string, (data: Record<string, unknown>) => Promise<void>> = {
  'send-verification-email': async (data) => {
    await sendEmail({ to: data.to as string, subject: data.subject as string, html: buildVerificationHtml(data.token as string) });
  },
  'send-welcome-email': async (data) => {
    await sendEmail({ to: data.to as string, subject: data.subject as string, html: buildWelcomeHtml(data.name as string) });
  },
  'forgot-password': async (data) => {
    await sendEmail({ to: data.to as string, subject: data.subject as string, html: buildForgotPasswordHtml(data.otp as string) });
  },
  'order-placed': async (data) => {
    await sendEmail({ to: data.to as string, subject: data.subject as string, html: buildOrderHtml(data.subject as string, data.order as Record<string, unknown>) });
  },
  'order-shipped': async (data) => {
    await sendEmail({ to: data.to as string, subject: data.subject as string, html: buildOrderHtml(data.subject as string, data.order as Record<string, unknown>) });
  },
  'order-delivered': async (data) => {
    await sendEmail({ to: data.to as string, subject: data.subject as string, html: buildOrderHtml(data.subject as string, data.order as Record<string, unknown>) });
  },
  'payment-received': async (data) => {
    if (data.to) await sendEmail({ to: data.to as string, subject: data.subject as string, html: buildOrderHtml(data.subject as string, data.order as Record<string, unknown>) });
  },
  'payment-confirmed': async (data) => {
    const adminEmail = config.smtp.user;
    if (adminEmail) await sendEmail({ to: adminEmail, subject: data.subject as string, html: buildOrderHtml(data.subject as string, data.order as Record<string, unknown>) });
  },
  'payment-failed': async (data) => {
    if (data.to) await sendEmail({ to: data.to as string, subject: data.subject as string, html: buildOrderHtml(data.subject as string, data.order as Record<string, unknown>) });
  },
  'payment-utr-submitted': async (data) => {
    const adminEmail = config.smtp.user;
    if (adminEmail) await sendEmail({ to: adminEmail, subject: data.subject as string, html: buildOrderHtml(data.subject as string, data.order as Record<string, unknown>) });
  },
  'back-in-stock': async (data) => {
    const emails = data.emails as string[];
    if (Array.isArray(emails) && emails.length > 0) {
      await sendEmail({ to: emails, subject: data.subject as string, html: buildBackInStockHtml() });
    }
  },
};

export const startEmailWorker = (): Worker => {
  const worker = new Worker('email', async (job) => {
    const handler = emailHandlers[job.name];
    if (handler) {
      logger.info(`Processing email job: ${job.id} - ${job.name}`);
      await handler(job.data);
    } else {
      logger.warn(`Unknown email job type: ${job.name}`);
    }
  }, { connection });

  worker.on('completed', (job) => {
    logger.info(`Email job ${job?.id} completed: ${job?.name}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Email job ${job?.id} failed: ${job?.name}`, { error: err.message });
  });

  logger.info('Email worker started');
  return worker;
};
