const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Carrega todas as lojas configuradas via variáveis de ambiente
 */
function loadStores() {
  const stores = [];
  let i = 1;

  while (process.env[`SHOPIFY_STORE_${i}_DOMAIN`]) {
    stores.push({
      domain: process.env[`SHOPIFY_STORE_${i}_DOMAIN`],
      accessToken: process.env[`SHOPIFY_STORE_${i}_ACCESS_TOKEN`],
      webhookSecret: process.env[`SHOPIFY_STORE_${i}_WEBHOOK_SECRET`]
    });
    i++;
  }

  return stores;
}

/**
 * Retorna configuração da loja pelo domínio
 */
function getStoreConfig(domain) {
  return loadStores().find(s => s.domain === domain) || null;
}

/**
 * Atualiza pedido na Shopify (NOTE + TAGS)
 * ⚠️ Sem metafields (causava erro 403)
 */
async function updateOrderTracking(storeDomain, orderId, trackingData) {
  const store = getStoreConfig(storeDomain);

  if (!store) {
    throw new Error(`Loja não encontrada: ${storeDomain}`);
  }

  const url = `https://${store.domain}/admin/api/2024-01/orders/${orderId}.json`;

  const payload = {
    order: {
      id: orderId,
      note: `Rastreio: ${trackingData.tracking_code} | Entrega: ${trackingData.estimated_delivery_formatted}`,
      tags: `rastreio-gerado,pais-${trackingData.country_code}`
    }
  };

  try {
    const res = await axios.put(url, payload, {
      headers: {
        'X-Shopify-Access-Token': store.accessToken,
        'Content-Type': 'application/json'
      }
    });

    logger.info(`✅ Shopify atualizado | Pedido ${orderId}`);
    return res.data;

  } catch (error) {
    console.error("❌ ERRO SHOPIFY:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Buscar pedido
 */
async function getOrder(storeDomain, orderId) {
  const store = getStoreConfig(storeDomain);

  if (!store) {
    throw new Error(`Loja não encontrada: ${storeDomain}`);
  }

  const res = await axios.get(
    `https://${store.domain}/admin/api/2024-01/orders/${orderId}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': store.accessToken
      }
    }
  );

  return res.data.order;
}

module.exports = {
  updateOrderTracking,
  getOrder,
  loadStores,
  getStoreConfig
};