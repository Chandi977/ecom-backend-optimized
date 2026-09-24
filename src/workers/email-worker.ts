import { Worker, ConnectionOptions } from 'bullmq';
import mongoose from 'mongoose';
import { config } from '../config';
import { sendEmail, verifyMailer } from '../utils/mailer';
import { logger } from '../utils/logger';
import { getBullConnection } from '../utils/redis';
import { Product } from '../models';
import { renderEmail } from '../modules/notification/notification-template.service';
import { buildUnsubscribeUrl } from '../modules/marketing/marketing.service';
import { recordCampaignProgress } from '../modules/marketing/campaign.service';
import { bootWorkerProcess } from './boot';

// Base HTML layout wrapper for email templates. `preheader` is the hidden inbox
// preview snippet (shown in the list view before the email is opened).
const buildEmailLayout = (title: string, contentHtml: string, preheader = ''): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
    :root { color-scheme: light; supported-color-schemes: light; }
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; display:block; }
    body { margin:0!important; padding:0!important; width:100%!important; background-color:#f3f6fb; font-family:'Poppins','Segoe UI',Arial,Helvetica,sans-serif; color:#102050; }
    .email-bg { width:100%; background:linear-gradient(180deg,#eef3fb 0%,#f8fafc 45%,#f3f6fb 100%); padding:32px 12px; }
    .container { width:100%; max-width:640px; margin:0 auto; background:#fff; border-radius:18px; overflow:hidden; border:1px solid #e7edf6; box-shadow:0 14px 36px rgba(16,32,80,.10); }
    .topbar { background:#102050; color:#fff; font-size:12px; line-height:18px; padding:10px 28px; text-align:center; letter-spacing:.2px; }
    .header { background:#fff; padding:28px 32px 20px; text-align:center; }
    .logo { max-height:48px; width:auto; margin:0 auto; }
    .brand-text { color:#102050; font-size:23px; font-weight:800; letter-spacing:1px; line-height:28px; text-align:center; margin-top:10px; }
    .brand-text span { color:#F02020; }
    .hero-line { height:5px; background:linear-gradient(90deg,#102050 0%,#F02020 42%,#ff7a1a 100%); line-height:5px; font-size:5px; }
    .trust-strip { width:100%; background:#fff7f7; border-bottom:1px solid #ffe0e0; }
    .trust-strip td { padding:12px 10px; font-size:12px; color:#5b6475; text-align:center; font-weight:600; }
    .trust-dot { color:#F02020; font-weight:800; padding-right:5px; }
    .content { padding:36px 34px 30px; }
    .footer { background:#0f1f4d; padding:28px 32px; text-align:center; font-size:13px; color:#c8d2e6; line-height:1.6; }
    .footer a { color:#fff; text-decoration:none; font-weight:600; }
    .footer-links { margin-bottom:18px; color:#60739e; }
    .footer-links a { display:inline-block; margin:4px 8px; }
    h1 { font-size:26px; line-height:1.25; color:#102050; margin:0 0 16px; font-weight:800; letter-spacing:-.3px; }
    h2 { font-size:20px; line-height:1.3; color:#102050; margin:0 0 14px; font-weight:750; }
    h3 { color:#102050; font-size:17px; line-height:1.35; margin:0 0 10px; font-weight:700; }
    p { font-size:15.5px; line-height:1.65; color:#506078; margin:0 0 16px; }
    .btn { display:inline-block; background:#F02020; color:#fff!important; text-decoration:none; padding:14px 30px; font-size:15px; font-weight:800; border-radius:999px; margin-top:16px; margin-bottom:16px; box-shadow:0 10px 18px rgba(240,32,32,.24); letter-spacing:.1px; }
    .card { background:#f8fafc; border:1px solid #e4eaf4; border-radius:14px; padding:22px; margin-bottom:24px; }
    .highlight-card { background:linear-gradient(135deg,#fff5f5 0%,#ffffff 58%,#f6f8ff 100%); border:1px solid #ffd6d6; border-radius:16px; padding:22px; margin:26px 0; }
    .badge { display:inline-block; padding:7px 12px; font-size:11px; font-weight:800; border-radius:999px; text-transform:uppercase; letter-spacing:.45px; }
    .badge-success { background:#dcfce7; color:#15803d; }
    .badge-info { background:#dbeafe; color:#1d4ed8; }
    .badge-warning { background:#fef3c7; color:#b45309; }
    .badge-danger { background:#fee2e2; color:#b91c1c; }
    .badge-secondary { background:#f1f5f9; color:#475569; }
    .otp-code { font-size:32px; font-weight:700; letter-spacing:6px; color:#F02020; background-color:#fff5f5; padding:16px 24px; border-radius:12px; border:1px dashed #ff8a8a; display:inline-block; margin:20px 0; font-family:'Courier New',Courier,monospace; }
    .order-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; border:1px solid #e4eaf4; border-radius:14px; margin:18px 0 24px; }
    .order-table { width:100%; min-width:540px; border-collapse:collapse; margin:0; background:#fff; }
    .order-table th { text-align:left; padding:14px 12px; background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#102050; font-size:12px; text-transform:uppercase; letter-spacing:.35px; font-weight:800; }
    .order-table td { padding:14px 12px; border-bottom:1px solid #edf2f7; color:#334155; font-size:14px; vertical-align:middle; }
    .order-table tr.total-row td { border-top:2px solid #102050; border-bottom:none; font-weight:800; font-size:16px; color:#102050; background:#f8fafc; }
    .order-items-list { margin:18px 0 18px; }
    .order-item-card { border:1px solid #e4eaf4; border-radius:14px; background:#fff; padding:16px; margin-bottom:12px; }
    .order-item-name { font-size:15px; line-height:1.4; font-weight:800; color:#102050; margin-bottom:4px; }
    .order-item-meta { font-size:12.5px; line-height:1.5; color:#64748b; margin-bottom:12px; }
    .order-item-stat { padding:8px 0; border-top:1px solid #edf2f7; }
    .order-item-stat-label { font-size:11px; text-transform:uppercase; letter-spacing:.35px; font-weight:800; color:#64748b; }
    .order-item-stat-value { font-size:14px; font-weight:700; color:#102050; text-align:right; }
    .order-summary { width:100%; border-collapse:collapse; border:1px solid #e4eaf4; border-radius:14px; overflow:hidden; margin:8px 0 24px; background:#fff; }
    .order-summary td { padding:12px 14px; border-bottom:1px solid #edf2f7; font-size:14px; color:#475569; }
    .order-summary .summary-label { font-weight:700; }
    .order-summary .summary-value { text-align:right; font-weight:800; color:#102050; }
    .order-summary .summary-total td { border-bottom:none; border-top:2px solid #102050; font-size:16px; background:#f8fafc; color:#102050; }
    @media only screen and (max-width:600px){ .email-bg{padding:0;background:#fff}.container{border-radius:0;border:none;box-shadow:none}.topbar{padding:9px 14px;font-size:11px}.header{padding:22px 18px 18px}.logo{max-height:42px!important}.brand-text{font-size:20px!important;line-height:24px!important}.trust-strip td{display:block;width:100%!important;box-sizing:border-box;padding:8px 12px!important;border-bottom:1px solid #ffe7e7}.content{padding:28px 18px 24px}.footer{padding:24px 18px}.footer-links a{display:inline-block;margin:5px 7px}h1{font-size:22px!important;line-height:1.3!important}h2{font-size:18px!important}h3{font-size:16px!important}p{font-size:14px!important;line-height:1.62!important}.card,.highlight-card,.otp-code{padding:18px!important;border-radius:14px!important}.btn{display:block!important;text-align:center!important;padding:14px 18px!important}.order-table{min-width:0!important}.order-table th,.order-table td{padding:10px 8px!important;font-size:12px!important}.order-table th{font-size:10px!important;white-space:nowrap}.order-table tr.total-row td{font-size:14px!important}.order-item-card{padding:14px!important;border-radius:12px!important}.order-item-stat td{display:table-cell!important;width:50%!important}.order-summary td{padding:11px 12px!important;font-size:13px!important}.order-summary .summary-total td{font-size:15px!important}.delivery-table,.delivery-table tbody,.delivery-table tr,.delivery-table td{display:block!important;width:100%!important;box-sizing:border-box!important;padding-left:0!important;padding-right:0!important}.otp-code{font-size:24px!important;letter-spacing:4px!important;padding:12px 16px!important} }
  </style>
</head>
<body>
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>` : ''}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-bg"><tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="container">
      <tr><td class="topbar">Premium packaging solutions for ecommerce, shipping and bulk business orders</td></tr>
      <tr><td class="header"><a href="https://store.prempackaging.com" target="_blank" style="text-decoration:none;display:inline-block;"><img src="https://store.prempackaging.com/pp_logo_1.png" alt="Prem Packaging" class="logo" style="max-height:48px;border:0;outline:none;display:block;margin:0 auto;"><div class="brand-text">PREM <span>PACKAGING</span></div></a></td></tr>
      <tr><td class="hero-line">&nbsp;</td></tr>
      <tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="trust-strip"><tr><td><span class="trust-dot">●</span>Secure checkout</td><td><span class="trust-dot">●</span>GST billing</td><td><span class="trust-dot">●</span>Bulk order support</td></tr></table></td></tr>
      <tr><td class="content">${contentHtml}</td></tr>
      <tr><td class="footer"><div class="footer-links"><a href="https://store.prempackaging.com">Shop Online</a><span style="color:#60739e;"> &bull; </span><a href="https://store.prempackaging.com/my-orders">Track Orders</a><span style="color:#60739e;"> &bull; </span><a href="https://store.prempackaging.com/contact-form">Contact Us</a></div><p style="font-size:12px;color:#c8d2e6;margin:0 0 10px;">&copy; ${new Date().getFullYear()} Prem Industries India Limited. All rights reserved.<br>C-209, Bulandshahar Road, Industrial Area, Ghaziabad, Uttar Pradesh - 201009</p><p style="font-size:11px;color:#8493b6;margin:0;">You are receiving this email because you registered or made a purchase on store.prempackaging.com.</p></td></tr>
    </table>
  </td></tr></table>
</body>
</html>
`;

interface IEmailBuild {
  subject: string;
  html: string;
}

/**
 * Render an editable email template (active DB override or seeded code default)
 * into a wrapped, ready-to-send email. The template `subject` wins when set;
 * otherwise the transactional `fallbackSubject` (from the queued job) is used.
 */
const renderTemplateEmail = async (
  key: string,
  vars: Record<string, unknown>,
  fallbackSubject: string,
): Promise<IEmailBuild> => {
  const rendered = await renderEmail(key, vars);
  const subject = rendered?.subject?.trim() || fallbackSubject;
  const content = rendered?.content ?? '';
  return { subject, html: buildEmailLayout(subject, content) };
};

export const buildVerificationHtml = async (token: string, fallbackSubject = 'Verify Your Email - Prem Packaging'): Promise<IEmailBuild> =>
  renderTemplateEmail('verification-email', { token }, fallbackSubject);

export const buildWelcomeHtml = async (name: string, fallbackSubject = 'Welcome to Prem Packaging'): Promise<IEmailBuild> =>
  renderTemplateEmail('welcome-email', { name }, fallbackSubject);

export const buildForgotPasswordHtml = async (otp: string, fallbackSubject = 'Reset Your Password - Prem Packaging'): Promise<IEmailBuild> =>
  renderTemplateEmail('forgot-password-email', { otp }, fallbackSubject);

export const buildLeadAutoResponseHtml = async (
  name: string,
  message: string,
  fallbackSubject = 'We received your message - Prem Packaging',
): Promise<IEmailBuild> =>
  renderTemplateEmail('lead-autoresponse-email', {
    name,
    // Show a friendly placeholder when the visitor left the message blank.
    message: message?.trim() ? message : 'No additional message was provided.',
  }, fallbackSubject);

export const buildLeadAdminNotifyHtml = async (
  vars: { name: string; email: string; phone?: string; message?: string; source?: string },
  fallbackSubject = 'New enquiry - Prem Packaging',
): Promise<IEmailBuild> =>
  renderTemplateEmail('lead-admin-notify-email', {
    name: vars.name,
    email: vars.email,
    phone: vars.phone || '—',
    message: vars.message?.trim() ? vars.message : '—',
    source: vars.source || 'contact-us',
  }, fallbackSubject);

const ORDER_TEMPLATE_KEYS: Record<string, string> = {
  'order-placed': 'order-placed-email',
  'order-shipped': 'order-shipped-email',
  'order-delivered': 'order-delivered-email',
  'order-status-updated': 'order-status-email',
  'payment-failed': 'payment-failed-email',
  'payment-utr-received': 'payment-utr-received-email',
};

export const buildOrderHtml = async (
  subject: string,
  order: Record<string, any>,
  jobName = 'order-placed',
): Promise<IEmailBuild> => {
  const templateKey = ORDER_TEMPLATE_KEYS[jobName] || 'order-placed-email';
  const orderStatus = (order.status || 'placed').toLowerCase();
  const paymentStatus = (order.paymentStatus || 'Not Paid').toLowerCase();
  const isShipped = ['shipped', 'dispatched'].includes(orderStatus);

  let statusColor = '#2563eb';
  let statusLabel = order.status || 'Placed';
  let statusBadgeClass = 'badge-info';

  if (orderStatus === 'delivered') {
    statusColor = '#16a34a';
    statusBadgeClass = 'badge-success';
    statusLabel = 'Delivered';
  } else if (isShipped) {
    statusColor = '#2563eb';
    statusBadgeClass = 'badge-info';
    statusLabel = 'Shipped';
  } else if (orderStatus === 'cancelled') {
    statusColor = '#dc2626';
    statusBadgeClass = 'badge-danger';
    statusLabel = 'Cancelled';
  } else if (paymentStatus === 'payment failed') {
    statusColor = '#dc2626';
    statusBadgeClass = 'badge-danger';
    statusLabel = 'Payment Failed';
  } else if (['paid', 'payment verified'].includes(paymentStatus) || ['confirmed', 'payment verified'].includes(orderStatus)) {
    statusColor = '#16a34a';
    statusBadgeClass = 'badge-success';
    statusLabel = 'Confirmed';
  }

  const items = [];
  if (order.items && Array.isArray(order.items)) {
    for (const item of order.items) {
      const productDetails = item.product;
      let name = 'Packaging Item';
      let model = '';

      if (productDetails && (typeof productDetails === 'string' || productDetails instanceof mongoose.Types.ObjectId)) {
        const prodId = productDetails.toString();
        try {
          const prod = await Product.findById(prodId).select('name model').lean().exec();
          if (prod) {
            name = prod.name;
            model = prod.model || '';
          } else {
            name = `Product [ID: ${prodId.substring(prodId.length - 6)}]`;
          }
        } catch (err) {
          logger.error('Error populating product in email-worker', { prodId, error: err });
          name = `Product [ID: ${prodId.substring(prodId.length - 6)}]`;
        }
      } else if (productDetails && typeof productDetails === 'object') {
        name = productDetails.name || 'Packaging Item';
        model = productDetails.model || '';
      }

      items.push({
        ...item,
        name: model ? `${name} (${model})` : name
      });
    }
  }

  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }) : new Date().toLocaleDateString('en-IN');

  const formatCurrency = (val: any) => {
    const num = Number(val);
    if (isNaN(num)) return '₹0.00';
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const toMoney = (val: any): number => {
    const num = Number(val);
    return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
  };

  const calculateLineGst = (lineTotal: number, gstRate: number): number => {
    if (!Number.isFinite(gstRate) || gstRate < 0) return 0;
    return toMoney((lineTotal * gstRate) / 100);
  };

  let itemsGst = 0;
  let itemsSubtotal = 0;

  if (order.items && Array.isArray(order.items)) {
    for (const item of order.items) {
      const qty = toMoney(item.quantity);
      const price = toMoney(item.price);
      const lineTotal = toMoney(item.totalPrice ?? (qty * price));
      const gstRate = Number(item.gst);
      const storedGstAmount = toMoney(item.gstAmount);
      itemsSubtotal += lineTotal;
      itemsGst += storedGstAmount > 0 || gstRate === 0 ? storedGstAmount : calculateLineGst(lineTotal, gstRate);
    }
  }

  const shippingEx = toMoney(order.shippingCost);
  const taxableAmount = toMoney(order.taxableAmount);
  const totalPaid = toMoney(order.totalOrderValue);
  const fallbackSubtotalEx = toMoney(order.totalCartValue ?? order.total);
  const displaySubtotalEx = itemsSubtotal > 0 ? toMoney(itemsSubtotal) : fallbackSubtotalEx;
  const displayShippingEx = shippingEx;
  const serverGstTotal = taxableAmount > 0 && totalPaid > 0 ? toMoney(totalPaid - taxableAmount) : 0;
  const totalGstCombined = serverGstTotal > 0 ? serverGstTotal : toMoney(itemsGst);
  const displayTotalPaid = totalPaid || toMoney(displaySubtotalEx + displayShippingEx + totalGstCombined);

  let itemsHtml = '';
  let itemsCardsHtml = '';
  for (const item of items) {
    const qty = toMoney(item.quantity);
    const price = toMoney(item.price);
    const packSize = item.packSize || 1;
    const itemGstRate = Number(item.gst);
    const gstPct = Number.isFinite(itemGstRate) ? `${itemGstRate}%` : 'N/A';
    const itemTotalPriceExGst = toMoney(item.totalPrice ?? (qty * price));
    const storedGstAmount = toMoney(item.gstAmount);
    const itemGstAmount = storedGstAmount > 0 || itemGstRate === 0
      ? storedGstAmount
      : calculateLineGst(itemTotalPriceExGst, itemGstRate);
    const displayTotal = toMoney(itemTotalPriceExGst + itemGstAmount);
    const displayPrice = qty > 0 ? toMoney(itemTotalPriceExGst / qty) : price;

    itemsHtml += `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: left;">
          <div style="font-weight: 600; color: #1e293b;">${item.name}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Pack Size: ${packSize} pcs</div>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">${qty}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${formatCurrency(displayPrice)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 13px; color: #64748b;">
          ${gstPct}
          <br><span style="font-size: 11px; color: #94a3b8; font-weight: 500;">(${formatCurrency(itemGstAmount)})</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 500;">${formatCurrency(displayTotal)}</td>
      </tr>
    `;

    itemsCardsHtml += `
      <div class="order-item-card">
        <div class="order-item-name">${item.name}</div>
        <div class="order-item-meta">Pack Size: ${packSize} pcs</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr class="order-item-stat">
            <td class="order-item-stat-label">Qty</td>
            <td class="order-item-stat-value">${qty}</td>
          </tr>
          <tr class="order-item-stat">
            <td class="order-item-stat-label">Price</td>
            <td class="order-item-stat-value">${formatCurrency(displayPrice)}</td>
          </tr>
          <tr class="order-item-stat">
            <td class="order-item-stat-label">GST</td>
            <td class="order-item-stat-value">${gstPct} (${formatCurrency(itemGstAmount)})</td>
          </tr>
          <tr class="order-item-stat">
            <td class="order-item-stat-label">Total</td>
            <td class="order-item-stat-value">${formatCurrency(displayTotal)}</td>
          </tr>
        </table>
      </div>
    `;
  }

  const addressHtml = [
    order.address,
    order.town,
    order.state + ' - ' + order.pincode,
    order.landmark ? `Landmark: ${order.landmark}` : ''
  ].filter(Boolean).join('<br>');

  const statusDetailsHtml = [
    isShipped && order.trackingId ? `<br>Delivery Partner: <strong>${order.deliveryPartner || 'Courier'}</strong><br>Tracking ID: <strong>${order.trackingId}</strong>` : '',
    isShipped ? `<br>You can track your shipping updates inside your Prem Packaging dashboard.` : '',
    orderStatus === 'placed' && paymentStatus === 'not paid' ? `<br>Please ensure payment is completed so we can begin processing your packaging items.` : '',
    paymentStatus === 'paid' ? `<br>Payment has been successfully verified. Thank you for your purchase!` : '',
  ].join('');

  const gstinHtml = order.gstin ? `<br>GSTIN: <strong>${order.gstin}</strong>` : '';
  const utrHtml = order.utrNumber ? `<br>UTR No: <strong>${order.utrNumber}</strong>` : '';

  const vars: Record<string, unknown> = {
    subject,
    statusLabel,
    statusBadgeClass,
    statusColor,
    orderNumber: order.orderId || order._id,
    statusDetailsHtml,
    itemsHtml,
    itemsCardsHtml,
    displaySubtotalEx: formatCurrency(displaySubtotalEx),
    displayShippingEx: formatCurrency(displayShippingEx),
    totalGstCombined: formatCurrency(totalGstCombined),
    displayTotalPaid: formatCurrency(displayTotalPaid),
    name: order.name,
    addressHtml,
    phone: order.phone,
    orderDate,
    paymentProvider: order.paymentProvider || 'Online Payment',
    paymentStatus: order.paymentStatus || 'Not Paid',
    gstinHtml,
    utrHtml,
  };

  return renderTemplateEmail(templateKey, vars, subject);
};

export const buildBackInStockHtml = async (productId: string, fallbackSubject = 'Product Back In Stock - Prem Packaging'): Promise<IEmailBuild> => {
  let productName = 'An item you were interested in';
  let productModel = '';
  let productSlug = '';
  let productDesc = '';

  try {
    const product = await Product.findById(productId).select('name model slug description').lean().exec();
    if (product) {
      productName = product.name;
      productModel = product.model || '';
      productSlug = product.slug || '';
      productDesc = product.description || '';
    }
  } catch (err) {
    logger.error('Failed to fetch product for back-in-stock email', { productId, error: err });
  }

  const productLink = productSlug ? `https://store.prempackaging.com/${productSlug}` : 'https://store.prempackaging.com';
  const productModelHtml = productModel ? `<p style="font-size: 14px; color: #64748b; margin-top: -8px; margin-bottom: 12px;">Model: <strong>${productModel}</strong></p>` : '';
  const productDescriptionHtml = productDesc ? `<p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 15px;">${productDesc.length > 150 ? productDesc.substring(0, 150) + '...' : productDesc}</p>` : '';

  return renderTemplateEmail('back-in-stock-email', {
    productName,
    productModelHtml,
    productDescriptionHtml,
    productLink,
  }, fallbackSubject);
};

// Escape user-authored text before dropping it into the email HTML.
const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Attribute-safe (href / src) escaping — keeps the value from breaking out of
// the quoted attribute.
const escapeAttr = (value: unknown): string =>
  String(value ?? '').replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E').trim();

// 'branded' wraps composed fields in the Prem header/footer template; 'custom'
// sends the author's full HTML document verbatim (design top-to-bottom, any brand).
export type PromotionalLayout = 'branded' | 'custom';

export interface IPromotionalContent {
  subject: string;
  previewText?: string;
  mode?: PromotionalLayout;
  // Full-custom mode: the complete email HTML authored in the composer.
  html?: string;
  // Branded mode: the composed building blocks.
  heading?: string;
  body?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

/**
 * Inject the recipient's real unsubscribe link into a full-custom email. Authors
 * can place `{{unsubscribe_url}}` (or `{{unsubscribe}}`) anywhere in their HTML;
 * if they include no unsubscribe reference at all we append a minimal footer so
 * every promotional send stays compliant.
 */
const applyCustomUnsubscribe = (html: string, unsubscribeUrl: string): string => {
  let out = String(html || '').replace(/\{\{\s*unsubscribe(?:_url)?\s*\}\}/gi, escapeAttr(unsubscribeUrl));
  if (!/unsubscribe/i.test(out)) {
    const footer = `<div style="text-align:center;padding:18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;">`
      + `<a href="${escapeAttr(unsubscribeUrl)}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a> from these emails.</div>`;
    out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${footer}</body>`) : out + footer;
  }
  return out;
};

// Looks like the author hand-wrote HTML (a tag such as <p>, <div>, <table>…).
const looksLikeHtml = (value: string): boolean => /<[a-z][\s\S]*>/i.test(value);

/**
 * Turn the composer's body into email HTML. The Promotional Email composer is an
 * admin-only, trusted surface, so an author who writes HTML tags gets that markup
 * rendered verbatim (full design freedom). Plain text is auto-formatted: blank
 * lines become paragraphs and single newlines become <br>.
 */
export const renderPromotionalBody = (body: string): string => {
  const raw = String(body || '');
  if (!raw.trim()) return '';
  if (looksLikeHtml(raw)) return raw;
  return raw
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 0)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
};

/**
 * Rich promotional email: optional hero image, heading, body (plain text OR
 * hand-written HTML — see renderPromotionalBody), an optional CTA button and a
 * per-recipient unsubscribe footer. This is the exact markup the admin composer
 * previews.
 */
export const buildPromotionalHtml = (content: IPromotionalContent, unsubscribeUrl: string): string => {
  // Full-custom mode: author owns the entire document — no Prem wrapper.
  if (content.mode === 'custom') {
    return applyCustomUnsubscribe(content.html || '', unsubscribeUrl);
  }

  const heroHtml = content.imageUrl
    ? `<img src="${escapeAttr(content.imageUrl)}" alt="" style="width:100%;max-width:100%;border-radius:14px;margin:0 0 26px;display:block;">`
    : '';
  const headingHtml = content.heading ? `<h1>${escapeHtml(content.heading)}</h1>` : '';
  const paragraphs = renderPromotionalBody(content.body || '');
  const ctaHtml = content.ctaLabel && content.ctaUrl
    ? `<div style="text-align:center;margin-top:28px;"><a href="${escapeAttr(content.ctaUrl)}" class="btn" style="color:#ffffff !important;">${escapeHtml(content.ctaLabel)}</a></div>`
    : '';
  const unsubscribeHtml = `
    <div style="text-align:center;margin-top:34px;border-top:1px solid #e2e8f0;padding-top:18px;">
      <p style="font-size:12px;color:#94a3b8;margin:0;line-height:1.6;">
        You are receiving this email because you subscribed or shopped with Prem Packaging.<br>
        <a href="${escapeAttr(unsubscribeUrl)}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a> from promotional emails.
      </p>
    </div>`;
  const inner = `${heroHtml}${headingHtml}${paragraphs}${ctaHtml}${unsubscribeHtml}`;
  return buildEmailLayout(content.subject || 'Prem Packaging', inner, content.previewText || '');
};

// Simple branded email for admin-composed broadcasts (title + free-text body).
export const buildBroadcastHtml = (title: string, body: string): string => {
  const paragraphs = String(body || '')
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const content = `<h1>${title || 'Prem Packaging'}</h1>${paragraphs}
    <div style="text-align:center;margin-top:30px;">
      <a href="https://store.prempackaging.com" class="btn" style="color:#ffffff !important;">Visit Store</a>
    </div>`;
  return buildEmailLayout(title || 'Prem Packaging', content);
};

// sendEmail returns false on SMTP failure; throwing here is what makes BullMQ
// retry the job (and lets the inline dispatcher report failure) instead of
// marking a never-delivered email as completed.
const sendOrThrow = async (options: { to: string | string[]; subject: string; html: string }): Promise<void> => {
  const sent = await sendEmail(options);
  if (!sent) {
    throw new Error(`SMTP send failed for "${options.subject}"`);
  }
};

export const emailHandlers: Record<string, (data: Record<string, any>) => Promise<void>> = {
  'send-verification-email': async (data) => {
    const { subject, html } = await buildVerificationHtml(data.token as string, data.subject as string);
    await sendOrThrow({ to: data.to as string, subject, html });
  },
  'send-welcome-email': async (data) => {
    const { subject, html } = await buildWelcomeHtml(data.name as string, data.subject as string);
    await sendOrThrow({ to: data.to as string, subject, html });
  },
  'forgot-password': async (data) => {
    const { subject, html } = await buildForgotPasswordHtml(data.otp as string, data.subject as string);
    await sendOrThrow({ to: data.to as string, subject, html });
  },
  'lead-autoresponse': async (data) => {
    const { subject, html } = await buildLeadAutoResponseHtml(data.name as string, data.message as string, data.subject as string);
    await sendOrThrow({ to: data.to as string, subject, html });
  },
  'lead-admin-notify': async (data) => {
    if (!data.to) return;
    const { subject, html } = await buildLeadAdminNotifyHtml({
      name: data.name as string,
      email: data.email as string,
      phone: data.phone as string,
      message: data.message as string,
      source: data.source as string,
    }, data.subject as string);
    await sendOrThrow({ to: data.to as string, subject, html });
  },
  'order-placed': async (data) => {
    const { subject, html } = await buildOrderHtml(data.subject as string, data.order as Record<string, unknown>, 'order-placed');
    await sendOrThrow({ to: data.to as string, subject, html });
  },
  'order-shipped': async (data) => {
    const { subject, html } = await buildOrderHtml(data.subject as string, data.order as Record<string, unknown>, 'order-shipped');
    await sendOrThrow({ to: data.to as string, subject, html });
  },
  'order-delivered': async (data) => {
    const { subject, html } = await buildOrderHtml(data.subject as string, data.order as Record<string, unknown>, 'order-delivered');
    await sendOrThrow({ to: data.to as string, subject, html });
  },
  'order-status-updated': async (data) => {
    const { subject, html } = await buildOrderHtml(data.subject as string, data.order as Record<string, unknown>, 'order-status-updated');
    await sendOrThrow({ to: data.to as string, subject, html });
  },
  'payment-received': async (data) => {
    if (data.to) {
      const { subject, html } = await buildOrderHtml(data.subject as string, data.order as Record<string, unknown>, 'order-placed');
      await sendOrThrow({ to: data.to as string, subject, html });
    }
  },
  'payment-confirmed': async (data) => {
    const adminEmail = config.smtp.user;
    if (adminEmail) {
      const { subject, html } = await buildOrderHtml(data.subject as string, data.order as Record<string, unknown>, 'order-placed');
      await sendOrThrow({ to: adminEmail, subject, html });
    }
  },
  'payment-failed': async (data) => {
    if (data.to) {
      const { subject, html } = await buildOrderHtml(data.subject as string, data.order as Record<string, unknown>, 'payment-failed');
      await sendOrThrow({ to: data.to as string, subject, html });
    }
  },
  'payment-utr-received': async (data) => {
    if (data.to) {
      const { subject, html } = await buildOrderHtml(data.subject as string, data.order as Record<string, unknown>, 'payment-utr-received');
      await sendOrThrow({ to: data.to as string, subject, html });
    }
  },
  'payment-utr-submitted': async (data) => {
    const adminEmail = config.smtp.user;
    if (adminEmail) {
      const { subject, html } = await buildOrderHtml(data.subject as string, data.order as Record<string, unknown>, 'order-placed');
      await sendOrThrow({ to: adminEmail, subject, html });
    }
  },
  'back-in-stock': async (data) => {
    const emails = data.emails as string[];
    if (Array.isArray(emails) && emails.length > 0) {
      const { subject, html } = await buildBackInStockHtml(data.productId as string, data.subject as string);
      await sendOrThrow({ to: emails, subject, html });
    }
  },
  'custom-broadcast': async (data) => {
    const emails = data.emails as string[];
    if (Array.isArray(emails) && emails.length > 0) {
      const subject = (data.subject as string) || 'Update from Prem Packaging';
      const html = buildBroadcastHtml(subject, data.body as string);
      // Send individually so recipient addresses are never exposed to each other.
      // Track failures but keep going so one bad address doesn't stop the batch.
      let failed = 0;
      for (const to of emails) {
        if (!(await sendEmail({ to, subject, html }))) failed += 1;
      }
      if (failed > 0) {
        throw new Error(`custom-broadcast: ${failed}/${emails.length} sends failed`);
      }
    }
  },
  // One chunk of a promotional campaign. Sends personalised (per-recipient
  // unsubscribe link) emails and records progress on the campaign document.
  // Never throws: a partial SMTP failure must not trigger a BullMQ retry that
  // would re-send to everyone in the chunk (duplicate emails). Failed addresses
  // are counted so the admin can see them and resend.
  'promotional-email': async (data) => {
    const recipients = data.recipients as Array<{ email: string; name?: string }>;
    if (!Array.isArray(recipients) || recipients.length === 0) return;
    const content: IPromotionalContent = {
      subject: (data.subject as string) || 'News from Prem Packaging',
      previewText: data.previewText as string,
      ...((data.content as Record<string, unknown>) || {}),
    };
    let ok = 0;
    let failed = 0;
    for (const r of recipients) {
      if (!r?.email) { failed += 1; continue; }
      const html = buildPromotionalHtml(content, buildUnsubscribeUrl(r.email));
      if (await sendEmail({ to: r.email, subject: content.subject, html })) ok += 1;
      else failed += 1;
    }
    if (data.campaignId) {
      await recordCampaignProgress(data.campaignId as string, ok, failed);
    }
  },
};

export const startEmailWorker = (): Worker => {
  const connection: ConnectionOptions = getBullConnection() as ConnectionOptions;
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
  // Fail fast in the logs when SMTP credentials are wrong — otherwise every
  // job just retries and dies quietly.
  verifyMailer().catch(() => { /* already logged inside */ });
  return worker;
};

// PM2 runs this file directly (see ecosystem.config.js) — boot everything the
// worker needs when executed as the process entry point.
if (require.main === module) {
  bootWorkerProcess('email', startEmailWorker);
}
