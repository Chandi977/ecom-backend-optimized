import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

/**
 * Surface SMTP misconfiguration loudly at startup instead of only when the
 * first email silently fails. Returns true when the transporter can log in.
 */
export const verifyMailer = async (): Promise<boolean> => {
  if (!config.smtp.user || !config.smtp.pass) {
    logger.error('SMTP is not configured — SMTP_USER / SMTP_PASS missing. Emails cannot be sent.');
    return false;
  }
  try {
    await transporter.verify();
    logger.info('SMTP transporter verified', { host: config.smtp.host, user: config.smtp.user });
    return true;
  } catch (error) {
    logger.error('SMTP transporter verification failed — check SMTP_HOST/PORT/USER/PASS (Gmail needs an App Password)', {
      host: config.smtp.host,
      port: config.smtp.port,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return false;
  }
};

export const sendEmail = async (options: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}): Promise<boolean> => {
  try {
    const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    await transporter.sendMail({
      from: options.from || `"Prem Industries" <${config.smtp.user}>`,
      to: recipients,
      subject: options.subject,
      html: options.html,
    });
    logger.info('Email sent successfully', {
      to: recipients,
      subject: options.subject,
    });
    return true;
  } catch (error) {
    logger.error('Failed to send email', {
      to: options.to,
      subject: options.subject,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return false;
  }
};

