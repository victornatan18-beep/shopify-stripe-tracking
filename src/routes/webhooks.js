const express = require('express');
const router = express.Router();
const validate = require('../middleware/validateWebhook');
const { buildTrackingPayload } = require('../services/trackingService');
const { updateOrderTracking } = require('../services/shopifyService');
const { findPaymentIntentByOrderId, updatePaymentIntent, markAsCancelled } = require('../services/stripeService');
const { sendTrackingEmail, sendErrorAlert } = require('../services/emailService');
const Tracking = require('../models/Tracking');
const logger = require('../utils/logger');

const processed = new Set();

router.post('/orders/create', validate, async (req, res) => {
  res.status(200).json({ received: true });
  const order = req.shopPayload;
  const storeDomain = req.shopDomain;
  const orderId = String(order.id);
  if (processed.has(orderId)) return;
  processed.add(orderId);
  try {
    logger.info(`📥 Novo pedido | ${storeDomain} | ${order.name}`);
    const trackingData = buildTrackingPayload(order, storeDomain);
    const tracking = new Tracking({ ...trackingData, history: [{ status:'created', message:'Código gerado automaticamente' }] });
    await updateOrderTracking(storeDomain, orderId, trackingData);
    const pi = await findPaymentIntentByOrderId(orderId);
    if (pi) {
      trackingData.stripe_payment_intent_id = pi.id;
      tracking.stripe_payment_intent_id = pi.id;
      await updatePaymentIntent(pi.id, trackingData);
    }
    await tracking.save();
    await sendTrackingEmail(trackingData);
    logger.info(`✅ Fluxo completo | ${trackingData.tracking_code}`);
  } catch (err) {
    logger.error(`❌ Erro pedido ${orderId}:`, err.message);
    await sendErrorAlert(err, `Pedido ${orderId} — ${storeDomain}`);
    processed.delete(orderId);
  }
});

router.post('/orders/cancelled', validate, async (req, res) => {
  res.status(200).json({ received: true });
  const order = req.shopPayload;
  const orderId = String(order.id);
  try {
    const tracking = await Tracking.findOne({ shopify_order_id: orderId });
    if (tracking) {
      tracking.status = 'cancelled';
      tracking.history.push({ status:'cancelled', message:'Cancelado na Shopify' });
      await tracking.save();
      if (tracking.stripe_payment_intent_id)
        await markAsCancelled(tracking.stripe_payment_intent_id, order.cancel_reason);
    }
    logger.info(`✅ Cancelamento processado | ${orderId}`);
  } catch (err) {
    logger.error(`❌ Erro cancelamento ${orderId}:`, err.message);
    await sendErrorAlert(err, `Cancelamento ${orderId}`);
  }
});

module.exports = router;