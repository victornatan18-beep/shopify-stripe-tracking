const { addBusinessDays, format } = require('date-fns');
const deliveryDays = require('../data/deliveryDays');

function generateCode(countryCode) {
  const c = (countryCode || 'XX').toUpperCase();
  const d = format(new Date(), 'yyyyMMdd');
  const r = Math.floor(10000 + Math.random() * 90000);
  return `${c}-${d}-${r}`;
}

function calcDeliveryDate(countryCode) {
  const days = deliveryDays[countryCode?.toUpperCase()] ?? deliveryDays.DEFAULT;
  const date = addBusinessDays(new Date(), days);
  return { days, date: format(date,'yyyy-MM-dd'), dateFormatted: format(date,'dd/MM/yyyy') };
}

function extractCountry(order) {
  return order?.shipping_address?.country_code || order?.billing_address?.country_code || 'XX';
}

function buildTrackingPayload(order, storeDomain) {
  const cc = extractCountry(order);
  const code = generateCode(cc);
  const delivery = calcDeliveryDate(cc);
  return {
    tracking_code: code,
    shopify_order_id: String(order.id),
    shopify_order_number: order.name,
    store: storeDomain,
    country_code: cc,
    country_name: order?.shipping_address?.country || cc,
    estimated_delivery_date: delivery.date,
    estimated_delivery_formatted: delivery.dateFormatted,
    estimated_days: delivery.days,
    customer: {
      name: (order?.customer?.first_name || '') + ' ' + (order?.customer?.last_name || ''),
      email: order?.customer?.email || order?.email
    },
    status: 'created',
    created_at: new Date().toISOString()
  };
}
module.exports = { generateCode, calcDeliveryDate, buildTrackingPayload };