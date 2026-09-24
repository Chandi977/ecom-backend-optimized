import { addJob, emailQueue } from '../../queue';
import { logger } from '../../utils/logger';
import { notifyUserEvent } from '../notification/custom-notification.service';

export interface INotifiableOrder {
  _id?: unknown;
  user?: unknown;
  email?: string;
  name?: string;
  orderId?: string;
  status?: string;
  paymentStatus?: string;
  trackingId?: string;
  deliveryPartner?: string;
  utrNumber?: string;
  toObject?: () => Record<string, unknown>;
}

export interface IOrderNotificationPlan {
  emailJob: string;
  emailSubject: string;
  pushTemplate: string;
}

const cleanLabel = (value: unknown, fallback: string): string => {
  const cleaned = String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
};

const normalize = (value: unknown): string => cleanLabel(value, '').toLowerCase();

const idOf = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const id = String(value);
  return id && id !== 'undefined' && id !== 'null' ? id : undefined;
};

const plainOrder = (order: INotifiableOrder): Record<string, unknown> =>
  typeof order.toObject === 'function' ? order.toObject() : { ...order };

export const getOrderStatusNotificationPlan = (
  status: unknown,
  hasTracking = false,
): IOrderNotificationPlan => {
  const label = cleanLabel(status, 'Updated');
  const normalized = label.toLowerCase();

  if (normalized === 'delivered') {
    return {
      emailJob: 'order-delivered',
      emailSubject: 'Your Order has been delivered',
      pushTemplate: 'order-delivered-push',
    };
  }

  if (hasTracking && ['dispatched', 'shipped'].includes(normalized)) {
    return {
      emailJob: 'order-shipped',
      emailSubject: 'Your Order has been shipped',
      pushTemplate: 'order-shipped-push',
    };
  }

  return {
    emailJob: 'order-status-updated',
    emailSubject: `Order update: ${label}`,
    pushTemplate: 'order-status-push',
  };
};

const deliverCustomerNotification = async (
  order: INotifiableOrder,
  plan: IOrderNotificationPlan,
  vars: Record<string, unknown>,
): Promise<void> => {
  const storedOrder = plainOrder(order);
  const databaseOrderId = idOf(order._id);

  if (order.email) {
    const queued = await addJob(emailQueue, plan.emailJob, {
      to: order.email,
      subject: plan.emailSubject,
      order: storedOrder,
    });
    if (!queued) {
      logger.warn('Customer order email was not queued', {
        orderId: order.orderId || databaseOrderId,
        job: plan.emailJob,
      });
    }
  }

  try {
    await notifyUserEvent(idOf(order.user), plan.pushTemplate, vars, {
      type: 'order',
      orderId: databaseOrderId,
      status: cleanLabel(order.status, 'Updated'),
    });
  } catch (error) {
    logger.error('Customer order push/in-app notification failed', {
      orderId: order.orderId || databaseOrderId,
      templateKey: plan.pushTemplate,
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
};

export const notifyOrderStatusChange = async (
  order: INotifiableOrder | null | undefined,
  previousStatus?: unknown,
  options: { force?: boolean } = {},
): Promise<boolean> => {
  if (!order) return false;
  const status = cleanLabel(order.status, 'Updated');
  if (!options.force && normalize(previousStatus) === normalize(status)) return false;

  const plan = getOrderStatusNotificationPlan(status, Boolean(order.trackingId));
  await deliverCustomerNotification(order, plan, {
    name: cleanLabel(order.name, 'Customer'),
    orderId: cleanLabel(order.orderId, idOf(order._id) || 'your order'),
    status,
    trackingId: cleanLabel(order.trackingId, 'Available in your order dashboard'),
    deliveryPartner: cleanLabel(order.deliveryPartner, 'our delivery partner'),
  });
  return true;
};

export const notifyOrderPaymentFailed = async (
  order: INotifiableOrder | null | undefined,
): Promise<boolean> => {
  if (!order) return false;
  await deliverCustomerNotification(order, {
    emailJob: 'payment-failed',
    emailSubject: 'Payment Failed',
    pushTemplate: 'payment-failed-push',
  }, {
    name: cleanLabel(order.name, 'Customer'),
    orderId: cleanLabel(order.orderId, idOf(order._id) || 'your order'),
  });
  return true;
};

export const notifyOrderPaymentReferenceSubmitted = async (
  order: INotifiableOrder | null | undefined,
): Promise<boolean> => {
  if (!order) return false;
  await deliverCustomerNotification(order, {
    emailJob: 'payment-utr-received',
    emailSubject: 'Payment details received',
    pushTemplate: 'payment-utr-submitted-push',
  }, {
    name: cleanLabel(order.name, 'Customer'),
    orderId: cleanLabel(order.orderId, idOf(order._id) || 'your order'),
  });
  return true;
};
