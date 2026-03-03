const express = require('express');
const router = express.Router();

const validate = require('../middleware/validateWebhook');
const { buildTrackingPayload } = require('../services/trackingService');
const { updateOrderTracking } = require('../services/shopifyService');
const Tracking = require('../models/Tracking');
const logger = require('../utils/logger');

const processed = new Set();

/**
 * WEBHOOK - PEDIDO CRIADO
 */
router.post('/orders/create', validate, async (req, res) => {
  // Responde rápido para Shopify
  res.status(200).json({ received: true });

  const order = req.shopPayload;
  const storeDomain = req.shopDomain;
  const orderId = String(order.id);

  if (processed.has(orderId)) return;
  processed.add(orderId);

  try {
    logger.info(`📥 Novo pedido | ${storeDomain} | ${order.name}`);

    // Monta dados de rastreio
    const trackingData = buildTrackingPayload(order, storeDomain);

    // Cria documento no Mongo
    const tracking = new Tracking({
      ...trackingData,
      history: [
        {
          status: 'created',
          message: 'Código gerado automaticamente'
        }
      ]
    });

    // Atualiza pedido na Shopify com código
    await updateOrderTracking(storeDomain, orderId, trackingData);

    // Salva no banco
    await tracking.save();

    logger.info(`✅ Código criado | ${trackingData.tracking_code}`);

  } catch (err) {
    console.error("ERRO REAL:", err);
    processed.delete(orderId);
  }
});


/**
 * WEBHOOK - PEDIDO CANCELADO
 */
router.post('/orders/cancelled', validate, async (req, res) => {
  res.status(200).json({ received: true });

  const order = req.shopPayload;
  const orderId = String(order.id);

  try {
    const tracking = await Tracking.findOne({ shopify_order_id: orderId });

    if (tracking) {
      tracking.status = 'cancelled';
      tracking.history.push({
        status: 'cancelled',
        message: 'Cancelado na Shopify'
      });

      await tracking.save();
    }

    logger.info(`✅ Cancelamento processado | ${orderId}`);

  } catch (err) {
    console.error("ERRO CANCELAMENTO:", err);
  }
});

module.exports = router;