const Stripe = require('stripe');
const logger = require('../utils/logger');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function updatePaymentIntent(piId, trackingData) {
  const metadata = {
    tracking_code:          trackingData.tracking_code,
    shopify_order_id:       trackingData.shopify_order_id,
    shopify_order_number:   trackingData.shopify_order_number,
    store:                  trackingData.store,
    destination_country:    trackingData.country_name,
    country_code:           trackingData.country_code,
    estimated_delivery:     trackingData.estimated_delivery_date,
    estimated_delivery_fmt: trackingData.estimated_delivery_formatted,
    customer_name:          trackingData.customer.name,
    customer_email:         trackingData.customer.email,
    tracking_status:        trackingData.status,
    generated_at:           trackingData.created_at
  };
  const updated = await stripe.paymentIntents.update(piId, { metadata });
  logger.info(`✅ Stripe atualizado | PI: ${piId}`);
  return updated;
}

async function findPaymentIntentByOrderId(shopifyOrderId) {
  const list = await stripe.paymentIntents.search({
    query: `metadata['shopify_order_id']:'${shopifyOrderId}'`, limit: 1
  });
  if (list.data.length > 0) return list.data[0];
  const charges = await stripe.charges.search({
    query: `metadata['shopify_order_id']:'${shopifyOrderId}'`, limit: 1
  });
  if (charges.data.length > 0)
    return stripe.paymentIntents.retrieve(charges.data[0].payment_intent);
  logger.warn(`⚠️ Payment Intent não encontrado para pedido ${shopifyOrderId}`);
  return null;
}

async function markAsCancelled(piId, reason) {
  return stripe.paymentIntents.update(piId, {
    metadata: { tracking_status:'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason || 'Cancelado na Shopify' }
  });
}

module.exports = { updatePaymentIntent, findPaymentIntentByOrderId, markAsCancelled };