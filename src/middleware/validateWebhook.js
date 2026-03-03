const crypto = require('crypto');
const { loadStores } = require('../services/shopifyService');
const logger = require('../utils/logger');

function validateShopifyWebhook(req, res, next) {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const shopDomain = req.headers['x-shopify-shop-domain'];
  if (!hmacHeader || !shopDomain)
    return res.status(401).json({ error: 'Headers obrigatórios ausentes' });

  const stores = loadStores();
  const store = stores.find(s => s.domain === shopDomain);
  if (!store) return res.status(401).json({ error: 'Loja não autorizada' });

  const expected = crypto.createHmac('sha256', store.webhookSecret)
    .update(req.body).digest('base64');

  if (!crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected))) {
    logger.warn(`🚨 Assinatura inválida | ${shopDomain}`);
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  req.shopDomain = shopDomain;
  req.shopPayload = JSON.parse(req.body.toString());
  next();
}
module.exports = validateShopifyWebhook;