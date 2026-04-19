import type { Order } from "@/hooks/useOrders";

export const ORDER_STATUSES = [
  'Order Received', 'Design Review', 'Plate Making', 'Printing',
  'Cutting / Binding', 'Quality Check', 'Ready to Dispatch',
  'Partially Fulfilled', 'Delivered', 'Payment Pending', 'Cancelled'
] as const;

export type OrderStatus = typeof ORDER_STATUSES[number];

export const STATUS_EMOJIS: Record<string, string> = {
  'Order Received': '📋',
  'Design Review': '🎨',
  'Plate Making': '🖨️',
  'Printing': '🖨️',
  'Cutting / Binding': '✂️',
  'Quality Check': '🔍',
  'Ready to Dispatch': '✅',
  'Partially Fulfilled': '📦',
  'Delivered': '🎉',
  'Payment Pending': '💰',
  'Cancelled': '❌',
};

export const STATUS_COLORS: Record<string, string> = {
  'Order Received': 'bg-status-received',
  'Design Review': 'bg-status-design',
  'Plate Making': 'bg-status-plate',
  'Printing': 'bg-status-printing',
  'Cutting / Binding': 'bg-status-cutting',
  'Quality Check': 'bg-status-quality',
  'Ready to Dispatch': 'bg-status-dispatch',
  'Partially Fulfilled': 'bg-status-partial',
  'Delivered': 'bg-status-delivered',
  'Payment Pending': 'bg-status-payment',
  'Cancelled': 'bg-status-cancelled',
};

export const STATUS_TEXT_COLORS: Record<string, string> = {
  'Order Received': 'text-status-received',
  'Design Review': 'text-status-design',
  'Plate Making': 'text-status-plate',
  'Printing': 'text-status-printing',
  'Cutting / Binding': 'text-status-cutting',
  'Quality Check': 'text-status-quality',
  'Ready to Dispatch': 'text-status-dispatch',
  'Partially Fulfilled': 'text-status-partial',
  'Delivered': 'text-status-delivered',
  'Payment Pending': 'text-status-payment',
  'Cancelled': 'text-status-cancelled',
};

/** Badge bg/text for Order History and lists (hex) */
export const STATUS_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
  'Order Received': { bg: '#DBEAFE', text: '#1D4ED8' },
  'Design Review': { bg: '#FEF3C7', text: '#92400E' },
  'Plate Making': { bg: '#FEF3C7', text: '#92400E' },
  'Printing': { bg: '#FEF3C7', text: '#92400E' },
  'Cutting / Binding': { bg: '#FEF3C7', text: '#92400E' },
  'Quality Check': { bg: '#FEF3C7', text: '#92400E' },
  'Ready to Dispatch': { bg: '#D1FAE5', text: '#065F46' },
  'Partially Fulfilled': { bg: '#E0E7FF', text: '#3730A3' },
  'Delivered': { bg: '#F3F4F6', text: '#374151' },
  'Payment Pending': { bg: '#FEE2E2', text: '#991B1B' },
  'Cancelled': { bg: '#F3F4F6', text: '#374151' },
};

export const SOURCE_COLORS: Record<string, string> = {
  'whatsapp': 'bg-source-whatsapp',
  'email': 'bg-source-email',
  'manual': 'bg-source-manual',
  'purchase_order': 'bg-sky-500',
  'online': 'bg-emerald-500',
};

export const PRODUCT_TYPES = [
  'Visiting Cards', 'Flex Banner', 'Brochure', 'Pamphlet',
  'Sticker', 'Letterhead', 'Bill Book', 'Carry Bag', 'Other'
];

export const COLOR_MODES = [
  { value: 'full_color', label: 'Full Color' },
  { value: 'black_white', label: 'Black & White' },
  { value: 'spot_color', label: 'Spot Color' },
];

export const ORDER_SOURCES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'manual', label: 'Manual' },
  { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'online', label: 'Online Form' },
];

// WhatsApp message templates per status
export const WHATSAPP_STATUS_TEMPLATES: Record<string, string> = {
  'Order Received': `Dear {{customer_name}}, 🙏 Thank you for choosing Super Printers!
✅ Your order has been received.
📋 Order #: {{order_no}}
🖨️ Job: {{product_type}} × {{quantity}}
📅 Expected Delivery: {{delivery_date}}
We'll keep you updated at every step!
📞 Super Printers: {{shop_phone}}`,

  'Design Review': `Dear {{customer_name}}, 🎨 Good news!
Your order #{{order_no}} is now in the design stage.
We'll notify you once it's sent for printing.
📞 Super Printers: {{shop_phone}}`,

  'Plate Making': `Dear {{customer_name}}, 🖨️ Your order #{{order_no}} plate is being prepared!
🎯 Expected delivery: {{delivery_date}}
📞 Super Printers: {{shop_phone}}`,

  'Printing': `Dear {{customer_name}}, 🖨️ Your order #{{order_no}} is now being printed!
🎯 Expected delivery: {{delivery_date}}
📞 Super Printers: {{shop_phone}}`,

  'Cutting / Binding': `Dear {{customer_name}}, ✂️ Your print job is in the finishing stage — almost done! Order #{{order_no}}
📞 Super Printers: {{shop_phone}}`,

  'Quality Check': `Dear {{customer_name}}, 🔍 We're doing a final quality check on your order #{{order_no}}. Delivery on track for {{delivery_date}}!
📞 Super Printers: {{shop_phone}}`,

  'Ready to Dispatch': `Dear {{customer_name}}, ✅ Great news! Your order is READY! 🎉
📋 Order #{{order_no}} — {{product_type}} × {{quantity}}
📍 Collect from: Super Printers
🕐 Timings: 9AM–8PM (Mon–Sat)
📞 Call us: {{shop_phone}}`,

  'Delivered': `Dear {{customer_name}}, 📦 Your order #{{order_no}} has been delivered!
Thank you for choosing Super Printers. 🙏
⭐ We'd love your feedback!
📞 Super Printers: {{shop_phone}}`,

  'Payment Pending': `Dear {{customer_name}}, 💰 Gentle reminder: Payment of ₹{{balance_due}} is pending for order #{{order_no}}.
📞 Super Printers: {{shop_phone}}`,

  'Cancelled': `Dear {{customer_name}}, ❌ Your order #{{order_no}} has been cancelled.
For queries, please contact us.
📞 Super Printers: {{shop_phone}}`,
};

export const ORDER_CREATED_TEMPLATE = `Hello {{customer_name}}! 👋

Thank you for placing your order with *Super Printers*. 🙏

We're getting your order ready and will notify you once it's shipped. 🚚✨

📦 *Order ID:* {{order_no}}

🛒 *Items:*
{{items_list}}
💳 *Invoice Total:* ₹{{amount}}
{{advance_line}}
📅 *Expected Delivery:* {{delivery_date}}

For any queries, feel free to reach us at {{shop_phone}}.

*Team Super Printers* 🖨️`;

export function fillOrderCreatedTemplate(
  order: Order,
  shopPhone: string,
  lineItems?: { description: string; quantity: number; amount: number }[]
): string {
  const deliveryDate = order.delivery_date
    ? new Date(order.delivery_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "TBD";
  const adv = Number(order.advance_paid) || 0;
  const total = Number(order.amount) || 0;

  let itemsList = "";
  if (lineItems && lineItems.length > 0) {
    itemsList = lineItems
      .map((li, i) => `  ${i + 1}. ${li.description} × ${li.quantity} — ₹${Number(li.amount).toLocaleString("en-IN")}`)
      .join("\n");
  } else {
    const qty = order.quantity || 0;
    itemsList = `  1. ${order.product_type || "Print Job"} × ${qty} — ₹${total.toLocaleString("en-IN")}`;
  }

  const advanceLine = adv > 0
    ? `✅ *Advance Paid:* ₹${adv.toLocaleString("en-IN")}\n💰 *Balance Due:* ₹${(total - adv).toLocaleString("en-IN")}\n`
    : "";

  return ORDER_CREATED_TEMPLATE
    .replace(/\{\{customer_name\}\}/g, order.customer_name || "")
    .replace(/\{\{order_no\}\}/g, order.order_no || "")
    .replace(/\{\{items_list\}\}/g, itemsList + "\n")
    .replace(/\{\{amount\}\}/g, total.toLocaleString("en-IN"))
    .replace(/\{\{advance_line\}\}/g, advanceLine)
    .replace(/\{\{delivery_date\}\}/g, deliveryDate)
    .replace(/\{\{shop_phone\}\}/g, shopPhone);
}

export function fillWhatsAppTemplate(template: string, order: Order, shopPhone: string): string {
  const deliveryDate = order.delivery_date 
    ? new Date(order.delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'TBD';
  const balanceDue = (Number(order.amount) || 0) - (Number(order.advance_paid) || 0);
  
  return template
    .replace(/\{\{customer_name\}\}/g, order.customer_name || '')
    .replace(/\{\{order_no\}\}/g, order.order_no || '')
    .replace(/\{\{product_type\}\}/g, order.product_type || '')
    .replace(/\{\{quantity\}\}/g, String(order.quantity || ''))
    .replace(/\{\{status\}\}/g, order.status || '')
    .replace(/\{\{delivery_date\}\}/g, deliveryDate)
    .replace(/\{\{amount\}\}/g, Number(order.amount).toLocaleString('en-IN'))
    .replace(/\{\{balance_due\}\}/g, balanceDue.toLocaleString('en-IN'))
    .replace(/\{\{shop_phone\}\}/g, shopPhone)
    .replace(/\{\{qty_ordered\}\}/g, String(order.qty_ordered || order.quantity || ''))
    .replace(/\{\{qty_fulfilled\}\}/g, String(order.qty_fulfilled || 0))
    .replace(/\{\{qty_pending\}\}/g, String(order.qty_pending || order.quantity || ''));
}
