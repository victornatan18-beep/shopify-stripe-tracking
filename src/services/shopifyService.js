const axios = require('axios');
const logger = require('../utils/logger');

function loadStores() {
  const stores = [];
  let i = 1;
  while (process.env[`SHOPIFY_STORE_${i}_DOMAIN`]) {
    stores.push({
      domain:        process.env[`SHOPIFY_STORE_${i}_DOMAIN`],
      accessToken:   process.env[`SHOPIFY_STORE_${i}_ACCESS_TOKEN`],
      webhookSecret: process.env[`SHOPIFY_STORE_${i}_WEBHOOK_SECRET`]
    });
    i++;
  }
  return stores;
}

function getStoreConfig(domain) {
  return loadStores().find(s => s.domain === domain) || null;
}

async function updateOrderTracking(storeDomain, orderId, trackingData) {
  const store = getStoreConfig(storeDomain);
  if (!store) throw new Error(`Loja não encontrada: ${storeDomain}`);
  const url = `https://${store.domain}/admin/api/2024-01/orders/${orderId}.json`;
  const payload = {
    order: {
      id: orderId,
      note: `Rastreio: ${trackingData.tracking_code} | Entrega: ${trackingData.estimated_delivery_formatted}`,
      tags: `rastreio-gerado,pais-${trackingData.country_code}`,
      metafields: [
        { namespace:'tracking', key:'code',              value: trackingData.tracking_code,          type:'single_line_text_field' },
        { namespace:'tracking', key:'estimated_delivery',value: trackingData.estimated_delivery_date, type:'date' }
      ]
    }
  };
  const res = await axios.put(url, payload, {
    headers: { 'X-Shopify-Access-Token': store.accessToken, 'Content-Type': 'application/json' }
  });
  logger.info(`✅ Shopify atualizado | Pedido ${orderId}`);
  return res.data;
}

async function getOrder(storeDomain, orderId) {
  const store = getStoreConfig(storeDomain);
  if (!store) throw new Error(`Loja não encontrada: ${storeDomain}`);
  const res = await axios.get(
    `https://${store.domain}/admin/api/2024-01/orders/${orderId}.json`,
    { headers: { 'X-Shopify-Access-Token': store.accessToken } }
  );
  return res.data.order;
}

module.exports = { updateOrderTracking, getOrder, loadStores, getStoreConfig };