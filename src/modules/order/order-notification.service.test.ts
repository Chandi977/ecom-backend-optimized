import { getOrderStatusNotificationPlan } from './order-notification.service';

describe('getOrderStatusNotificationPlan', () => {
  it('uses the delivered templates for a delivered order', () => {
    expect(getOrderStatusNotificationPlan('Delivered')).toEqual({
      emailJob: 'order-delivered',
      emailSubject: 'Your Order has been delivered',
      pushTemplate: 'order-delivered-push',
    });
  });

  it('uses the shipped templates when tracking information exists', () => {
    expect(getOrderStatusNotificationPlan('Dispatched', true)).toEqual({
      emailJob: 'order-shipped',
      emailSubject: 'Your Order has been shipped',
      pushTemplate: 'order-shipped-push',
    });
  });

  it('uses a generic update before tracking information exists', () => {
    expect(getOrderStatusNotificationPlan('Dispatched', false)).toEqual({
      emailJob: 'order-status-updated',
      emailSubject: 'Order update: Dispatched',
      pushTemplate: 'order-status-push',
    });
  });

  it('uses the generic templates for cancellation and sanitizes the subject', () => {
    expect(getOrderStatusNotificationPlan('Cancelled\r\nBCC: invalid')).toEqual({
      emailJob: 'order-status-updated',
      emailSubject: 'Order update: Cancelled BCC: invalid',
      pushTemplate: 'order-status-push',
    });
  });
});
