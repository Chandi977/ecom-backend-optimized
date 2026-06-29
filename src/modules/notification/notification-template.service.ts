import NotificationTemplate from './notification-template.model';
import { NotificationChannel } from './notification-template.model';
import { logger } from '../../utils/logger';

export interface ITemplateShape {
  key: string;
  channel: NotificationChannel;
  name: string;
  description: string;
  subject: string;
  body: string;
  variables: string[];
}

/**
 * Code-default notification templates. These are the single source of truth for
 * the wording of every notification and are seeded into the DB on startup so the
 * admin can edit them. The email `body` fields hold the inner content that the
 * email worker wraps with the shared `buildEmailLayout`. Order email content is
 * largely generated (items table / totals) and exposed here through computed
 * `{{placeholders}}` — only the surrounding copy is meant to be hand-edited.
 */
export const TEMPLATE_DEFAULTS: Record<string, Omit<ITemplateShape, 'key'>> = {
  'verification-email': {
    channel: 'email',
    name: 'Email Verification',
    description: 'Sent with the OTP when a new user registers.',
    subject: 'Verify Your Email - Prem Packaging',
    variables: ['token'],
    body: `
    <h1>Verify Your Email Address</h1>
    <p>Thank you for creating an account with <strong>Prem Packaging</strong>. To complete your registration and secure your account, please verify your email address using the one-time password (OTP) below:</p>
    <div style="text-align: center;">
      <div class="otp-code">{{token}}</div>
    </div>
    <p style="font-size: 14px; color: #64748b; text-align: center; margin-bottom: 30px;">
      This OTP is valid for <strong>1 hour</strong>. Please do not share this code with anyone.
    </p>
    <div style="border-top: 1px solid #e2e8f0; padding-top: 20px;">
      <p style="font-size: 14px; color: #64748b; margin: 0;">
        If you did not request this verification, you can safely ignore this email. A registration was initiated with your email address but cannot be completed without this verification code.
      </p>
    </div>
  `,
  },
  'welcome-email': {
    channel: 'email',
    name: 'Welcome Email',
    description: 'Sent after a user verifies their account.',
    subject: 'Welcome to Prem Packaging',
    variables: ['name'],
    body: `
    <h1>Welcome to Prem Packaging!</h1>
    <p>Dear {{name}},</p>
    <p>We are absolutely thrilled to welcome you to the <strong>Prem Packaging</strong> family! Your account is now active, and you are ready to explore our wide range of premium packaging solutions.</p>

    <div class="card" style="margin-top: 30px; margin-bottom: 30px; background-color: #fff5f5; border-color: #ffd6d6;">
      <h3 style="margin-top: 0; color: #F02020; font-size: 18px; font-weight: 600;">Get Started with 10% Off!</h3>
      <p style="margin-bottom: 12px; font-size: 15px; color: #475569;">As a special welcome gift, use the coupon code below at checkout to receive <strong>10% off</strong> on your first order:</p>
      <div style="font-size: 20px; font-weight: 700; color: #F02020; letter-spacing: 1px; margin-bottom: 8px;">WELCOME10</div>
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">*Valid on all standard corrugated boxes and tapes. Single use only.</p>
    </div>

    <h3 style="color: #102050; font-size: 18px; margin-bottom: 12px; font-weight: 600;">What we offer:</h3>
    <ul style="padding-left: 20px; margin-top: 0; margin-bottom: 25px; line-height: 1.6; color: #475569;">
      <li><strong>Corrugated Boxes:</strong> High durability boxes tailored for e-commerce, shipping, and heavy-duty storage.</li>
      <li><strong>Tapes & Accessories:</strong> High-adhesion BOPP and paper tapes to secure your packages.</li>
      <li><strong>Custom Packaging:</strong> Tailor-made sizes and branding to make your business stand out.</li>
    </ul>

    <div style="text-align: center; margin-top: 30px;">
      <a href="https://store.prempackaging.com" class="btn" style="color: #ffffff !important;">Explore Store Now</a>
    </div>
  `,
  },
  'forgot-password-email': {
    channel: 'email',
    name: 'Password Reset Email',
    description: 'Sent with the OTP when a user requests a password reset.',
    subject: 'Reset Your Password - Prem Packaging',
    variables: ['otp'],
    body: `
    <h1>Password Reset Request</h1>
    <p>We received a request to reset the password for your account on <strong>Prem Packaging</strong>. If you did not make this request, you can safely ignore this email.</p>
    <p>To set a new password, please use the one-time password (OTP) code below:</p>
    <div style="text-align: center;">
      <div class="otp-code">{{otp}}</div>
    </div>
    <p style="font-size: 14px; color: #64748b; text-align: center; margin-bottom: 30px;">
      This OTP code is valid for <strong>10 minutes</strong>. For security reasons, please do not share this code.
    </p>
    <div style="border-top: 1px solid #e2e8f0; padding-top: 20px;">
      <p style="font-size: 13px; color: #94a3b8; margin: 0;">
        If you suspect unauthorized access to your account, please reset your password immediately or contact our support team at ecommerce@premindustries.in.
      </p>
    </div>
  `,
  },
  'back-in-stock-email': {
    channel: 'email',
    name: 'Back In Stock Email',
    description: 'Sent to users who asked to be notified when a product is restocked. {{productModelHtml}} and {{productDescriptionHtml}} are generated.',
    subject: 'Product Back In Stock - Prem Packaging',
    variables: ['productName', 'productModelHtml', 'productDescriptionHtml', 'productLink'],
    body: `
    <h1>It's Back in Stock!</h1>
    <p>Good news! An item on your notification list is back in stock and ready to order. Don't miss out, as stock levels can change quickly due to high demand.</p>

    <div class="card" style="margin-top: 30px; margin-bottom: 30px; text-align: left;">
      <h3 style="margin-top: 0; color: #102050; font-size: 18px; font-weight: 600; margin-bottom: 8px;">{{productName}}</h3>
      {{productModelHtml}}
      {{productDescriptionHtml}}
      <div style="font-size: 15px; font-weight: 600; color: #16a34a; margin-bottom: 5px;">&bull; High Quality Corrugated Material</div>
      <div style="font-size: 15px; font-weight: 600; color: #16a34a; margin-bottom: 15px;">&bull; Ready for Immediate Dispatch</div>

      <div style="text-align: center; margin-top: 20px;">
        <a href="{{productLink}}" class="btn" style="margin: 0; background-color: #F02020; color: #ffffff !important;">Buy It Now</a>
      </div>
    </div>

    <p style="font-size: 14px; color: #64748b;">
      We appreciate your interest in our products. If you have any questions or require custom bulk order assistance, please reach out to our support team.
    </p>
  `,
  },
  // Order emails share one generated layout. The items table ({{itemsHtml}}),
  // totals and delivery block are computed by the worker; the heading, status
  // card copy and button are editable here.
  'order-placed-email': orderEmailDefault('Order Confirmation', 'Sent when a new order is placed.'),
  'order-shipped-email': orderEmailDefault('Order Shipped', 'Sent when an order is marked shipped.'),
  'order-delivered-email': orderEmailDefault('Order Delivered', 'Sent when an order is marked delivered.'),

  // ---- Push / in-app templates (mobile) ----
  'custom-broadcast': {
    channel: 'inapp',
    name: 'Custom Broadcast (default)',
    description: 'Default title/body used for admin broadcasts when none is provided.',
    subject: '{{title}}',
    variables: ['title', 'message'],
    body: '{{message}}',
  },
  'order-placed-push': {
    channel: 'push',
    name: 'Order Placed (push)',
    description: 'In-app/push notification sent to the customer when an order is placed.',
    subject: 'Order placed successfully',
    variables: ['name', 'orderId', 'status'],
    body: 'Hi {{name}}, your order {{orderId}} has been placed. We will keep you posted on its progress.',
  },
  'order-shipped-push': {
    channel: 'push',
    name: 'Order Shipped (push)',
    description: 'In-app/push notification sent when an order ships.',
    subject: 'Your order is on the way',
    variables: ['name', 'orderId', 'trackingId', 'deliveryPartner'],
    body: 'Good news {{name}}! Order {{orderId}} has shipped via {{deliveryPartner}}. Tracking: {{trackingId}}.',
  },
  'order-delivered-push': {
    channel: 'push',
    name: 'Order Delivered (push)',
    description: 'In-app/push notification sent when an order is delivered.',
    subject: 'Order delivered',
    variables: ['name', 'orderId'],
    body: 'Your order {{orderId}} has been delivered. Thank you for shopping with Prem Packaging!',
  },
  'back-in-stock-push': {
    channel: 'push',
    name: 'Back In Stock (push)',
    description: 'In-app/push notification when a watched product is restocked.',
    subject: 'Back in stock',
    variables: ['productName'],
    body: '{{productName}} is back in stock. Tap to grab it before it sells out again.',
  },
};

function orderEmailDefault(name: string, description: string): Omit<ITemplateShape, 'key'> {
  return {
    channel: 'email',
    name,
    description: `${description} The items table ({{itemsHtml}}), totals and delivery block are generated automatically.`,
    subject: '',
    variables: [
      'subject', 'statusLabel', 'statusBadgeClass', 'statusColor', 'orderNumber',
      'statusDetailsHtml', 'itemsHtml', 'displaySubtotalEx', 'displayShippingEx',
      'totalGstCombined', 'displayTotalPaid', 'name', 'addressHtml', 'phone',
      'orderDate', 'paymentProvider', 'paymentStatus', 'gstinHtml', 'utrHtml',
    ],
    body: `
    <div style="text-align: center; margin-bottom: 30px;">
      <span class="badge {{statusBadgeClass}}" style="margin-bottom: 10px;">{{statusLabel}}</span>
      <h1 style="margin-bottom: 10px;">{{subject}}</h1>
      <p style="font-size: 16px; color: #64748b; margin: 0;">Order #{{orderNumber}}</p>
    </div>

    <div class="highlight-card">
      <h3>Status Update</h3>
      <p style="margin:0;font-size:15px;color:#475569;line-height:1.5;">
        Your order is currently marked as <strong style="color: {{statusColor}}; text-transform: uppercase;">{{statusLabel}}</strong>.{{statusDetailsHtml}}
      </p>
    </div>

    <h2>Order Items</h2>
    <div class="order-table-wrap">
    <table class="order-table" style="width: 100%; border-collapse: collapse; margin: 25px 0;">
      <thead>
        <tr>
          <th style="width: 45%; text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 14px; text-transform: uppercase; font-weight: 600;">Product Details</th>
          <th style="width: 10%; text-align: center; padding: 12px; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 14px; text-transform: uppercase; font-weight: 600;">Qty</th>
          <th style="width: 15%; text-align: right; padding: 12px; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 14px; text-transform: uppercase; font-weight: 600;">Price</th>
          <th style="width: 12%; text-align: center; padding: 12px; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 14px; text-transform: uppercase; font-weight: 600;">GST</th>
          <th style="width: 18%; text-align: right; padding: 12px; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 14px; text-transform: uppercase; font-weight: 600;">Total</th>
        </tr>
      </thead>
      <tbody>
        {{itemsHtml}}
        <tr>
          <td colspan="3" style="border: none;"></td>
          <td style="padding: 8px 12px; text-align: right; color: #64748b; font-size: 14px; font-weight: 500;">Subtotal (Excl. GST):</td>
          <td style="padding: 8px 12px; text-align: right; font-weight: 500; font-size: 14px; border-bottom: 1px solid #f1f5f9;">{{displaySubtotalEx}}</td>
        </tr>
        <tr>
          <td colspan="3" style="border: none;"></td>
          <td style="padding: 8px 12px; text-align: right; color: #64748b; font-size: 14px; font-weight: 500;">Shipping (Excl. GST):</td>
          <td style="padding: 8px 12px; text-align: right; font-weight: 500; font-size: 14px; border-bottom: 1px solid #f1f5f9;">{{displayShippingEx}}</td>
        </tr>
        <tr>
          <td colspan="3" style="border: none;"></td>
          <td style="padding: 8px 12px; text-align: right; color: #64748b; font-size: 14px; font-weight: 500;">GST:</td>
          <td style="padding: 8px 12px; text-align: right; font-weight: 500; font-size: 14px; border-bottom: 1px solid #f1f5f9;">{{totalGstCombined}}</td>
        </tr>
        <tr class="total-row">
          <td colspan="3" style="border: none;"></td>
          <td style="padding: 12px; text-align: right; font-weight: 700; border-top: 2px solid #e2e8f0; font-size: 16px; color: #102050;">Total Paid:</td>
          <td style="padding: 12px; text-align: right; font-weight: 700; border-top: 2px solid #e2e8f0; font-size: 16px; color: #102050;">{{displayTotalPaid}}</td>
        </tr>
      </tbody>
    </table>
    </div>

    <table class="delivery-table" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
      <tr>
        <td style="width:50%;padding-right:14px;vertical-align:top;">
          <div class="card">
            <h3>Delivery Details</h3>
            <p style="font-size:14px;margin:0;">
              <strong>{{name}}</strong><br>
              {{addressHtml}}<br>
              Phone: {{phone}}
            </p>
          </div>
        </td>
        <td style="width:50%;padding-left:14px;vertical-align:top;">
          <div class="card">
            <h3>Order Information</h3>
            <p style="font-size:14px;margin:0;">
              Order Date: <strong>{{orderDate}}</strong><br>
              Payment: <strong>{{paymentProvider}}</strong><br>
              Payment Status: <strong>{{paymentStatus}}</strong>{{gstinHtml}}{{utrHtml}}
            </p>
          </div>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin-top: 35px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
      <a href="https://store.prempackaging.com/my-orders" class="btn" style="color: #ffffff !important;">View Order Dashboard</a>
    </div>
  `,
  };
}

/** Replace `{{ var }}` tokens with values from `vars` (missing -> empty string). */
export const renderTemplate = (template: string, vars: Record<string, unknown> = {}): string =>
  (template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });

/**
 * Returns the effective template for a key: an active DB override if one exists,
 * otherwise the code default. Returns null for unknown keys with no DB doc.
 */
export const getTemplate = async (key: string): Promise<ITemplateShape | null> => {
  const def = TEMPLATE_DEFAULTS[key];
  try {
    const doc = await NotificationTemplate.findOne({ key }).lean().exec();
    if (doc && doc.isActive) {
      return {
        key,
        channel: doc.channel,
        name: doc.name,
        description: doc.description || '',
        subject: doc.subject || (def?.subject ?? ''),
        body: doc.body || (def?.body ?? ''),
        variables: doc.variables?.length ? doc.variables : (def?.variables ?? []),
      };
    }
  } catch (err) {
    logger.error('getTemplate lookup failed; using code default', { key, error: err instanceof Error ? err.message : 'Unknown' });
  }
  if (def) return { key, ...def };
  return null;
};

/** Render a template's subject + body against `vars`. */
export const renderEmail = async (
  key: string,
  vars: Record<string, unknown>,
): Promise<{ subject: string; content: string } | null> => {
  const tpl = await getTemplate(key);
  if (!tpl) return null;
  return {
    subject: renderTemplate(tpl.subject, vars),
    content: renderTemplate(tpl.body, vars),
  };
};

/** Render a push/in-app template into a {title, body} pair. */
export const renderPush = async (
  key: string,
  vars: Record<string, unknown>,
): Promise<{ title: string; body: string } | null> => {
  const tpl = await getTemplate(key);
  if (!tpl) return null;
  return {
    title: renderTemplate(tpl.subject, vars),
    body: renderTemplate(tpl.body, vars),
  };
};

/**
 * Upsert any missing default templates. Idempotent and non-destructive: existing
 * documents (including admin edits) are never overwritten. Safe to call on every
 * boot. Returns the number of templates inserted.
 */
export const seedTemplates = async (): Promise<number> => {
  let inserted = 0;
  for (const [key, def] of Object.entries(TEMPLATE_DEFAULTS)) {
    try {
      const result = await NotificationTemplate.updateOne(
        { key },
        { $setOnInsert: { key, ...def, isActive: true } },
        { upsert: true },
      ).exec();
      if (result.upsertedCount && result.upsertedCount > 0) inserted += 1;
    } catch (err) {
      logger.error('Failed to seed notification template', { key, error: err instanceof Error ? err.message : 'Unknown' });
    }
  }
  if (inserted > 0) logger.info(`Seeded ${inserted} notification template(s)`);
  return inserted;
};
