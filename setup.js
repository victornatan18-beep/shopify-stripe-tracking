/**
 * setup.js — ShopifyStripeTracking
 * Rode: node setup.js
 * Cria toda a estrutura de pastas e arquivos do projeto.
 */

const fs = require('fs');
const path = require('path');

const files = {

'package.json': `{
  "name": "shopify-stripe-tracking",
  "version": "1.0.0",
  "description": "Sistema de rastreio automático — Shopify + Stripe",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "jest --coverage"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^8.0.0",
    "stripe": "^14.0.0",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5",
    "winston": "^3.11.0",
    "@sendgrid/mail": "^8.1.0",
    "date-fns": "^3.0.6"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "jest": "^29.7.0",
    "supertest": "^6.3.3"
  }
}`,

'.env.example': `# ─── APP ────────────────────────────────────────
PORT=3000
NODE_ENV=production
DASHBOARD_SECRET=troque_por_senha_forte

# ─── MONGODB ─────────────────────────────────────
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/tracking

# ─── SHOPIFY (uma entrada por loja) ──────────────
SHOPIFY_STORE_1_DOMAIN=loja1.myshopify.com
SHOPIFY_STORE_1_ACCESS_TOKEN=shpat_xxxx
SHOPIFY_STORE_1_WEBHOOK_SECRET=xxxx

SHOPIFY_STORE_2_DOMAIN=loja2.myshopify.com
SHOPIFY_STORE_2_ACCESS_TOKEN=shpat_yyyy
SHOPIFY_STORE_2_WEBHOOK_SECRET=yyyy

# ─── STRIPE ──────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_xxxx

# ─── EMAIL (SendGrid) ────────────────────────────
SENDGRID_API_KEY=SG.xxxx
EMAIL_FROM=noreply@suaempresa.com
EMAIL_FROM_NAME=Seu Sistema de Rastreio`,

'.gitignore': `node_modules/
.env
logs/
coverage/
*.log
.DS_Store`,

'Dockerfile': `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p logs
EXPOSE 3000
CMD ["node", "src/server.js"]`,

'src/server.js': `require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');
const path = require('path');
const logger = require('./utils/logger');
const rateLimiter = require('./middleware/rateLimiter');

const webhookRoutes  = require('./routes/webhooks');
const dashboardRoutes = require('./routes/dashboard');
const healthRoutes   = require('./routes/health');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(rateLimiter);
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/webhook', webhookRoutes);
app.use('/api', dashboardRoutes);
app.use('/health', healthRoutes);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => logger.info('✅ MongoDB conectado'))
  .catch(err => logger.error('❌ Erro MongoDB:', err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(\`🚀 Servidor rodando na porta \${PORT}\`));
module.exports = app;`,

'src/data/deliveryDays.js': `const deliveryDays = {
  BR: 7, AR: 15, CL: 12, CO: 14, PE: 14, UY: 12, PY: 15, BO: 18, EC: 14, VE: 20,
  US: 10, CA: 12, MX: 14,
  PT: 10, ES: 10, FR: 12, DE: 12, IT: 12, GB: 12, NL: 10, BE: 11, CH: 11, AT: 12, SE: 14, PL: 14,
  JP: 18, CN: 20, KR: 18, IN: 22, SG: 16, AE: 18,
  AU: 20, NZ: 22,
  DEFAULT: 25
};
module.exports = deliveryDays;`,

'src/utils/logger.js': `const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      \`[\${timestamp}] \${level.toUpperCase()}: \${message}\`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});
module.exports = logger;`,

'src/middleware/rateLimiter.js': `const rateLimit = require('express-rate-limit');
module.exports = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições, tente novamente em breve.' }
});`,

'src/middleware/validateWebhook.js': `const crypto = require('crypto');
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
    logger.warn(\`🚨 Assinatura inválida | \${shopDomain}\`);
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  req.shopDomain = shopDomain;
  req.shopPayload = JSON.parse(req.body.toString());
  next();
}
module.exports = validateShopifyWebhook;`,

'src/models/Tracking.js': `const mongoose = require('mongoose');
const historySchema = new mongoose.Schema({
  status: { type: String, required: true },
  message: String,
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const trackingSchema = new mongoose.Schema({
  tracking_code:                { type: String, required: true, unique: true },
  shopify_order_id:             { type: String, required: true, index: true },
  shopify_order_number:         String,
  stripe_payment_intent_id:     { type: String, index: true },
  store:                        { type: String, required: true },
  country_code:                 { type: String, required: true },
  country_name:                 String,
  estimated_delivery_date:      String,
  estimated_delivery_formatted: String,
  estimated_days:               Number,
  status: {
    type: String,
    enum: ['created','in_transit','out_for_delivery','delivered','cancelled'],
    default: 'created'
  },
  customer: { name: String, email: String },
  history: [historySchema]
}, { timestamps: true });

module.exports = mongoose.model('Tracking', trackingSchema);`,

'src/services/trackingService.js': `const { addBusinessDays, format } = require('date-fns');
const deliveryDays = require('../data/deliveryDays');

function generateCode(countryCode) {
  const c = (countryCode || 'XX').toUpperCase();
  const d = format(new Date(), 'yyyyMMdd');
  const r = Math.floor(10000 + Math.random() * 90000);
  return \`\${c}-\${d}-\${r}\`;
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
module.exports = { generateCode, calcDeliveryDate, buildTrackingPayload };`,

'src/services/shopifyService.js': `const axios = require('axios');
const logger = require('../utils/logger');

function loadStores() {
  const stores = [];
  let i = 1;
  while (process.env[\`SHOPIFY_STORE_\${i}_DOMAIN\`]) {
    stores.push({
      domain:        process.env[\`SHOPIFY_STORE_\${i}_DOMAIN\`],
      accessToken:   process.env[\`SHOPIFY_STORE_\${i}_ACCESS_TOKEN\`],
      webhookSecret: process.env[\`SHOPIFY_STORE_\${i}_WEBHOOK_SECRET\`]
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
  if (!store) throw new Error(\`Loja não encontrada: \${storeDomain}\`);
  const url = \`https://\${store.domain}/admin/api/2024-01/orders/\${orderId}.json\`;
  const payload = {
    order: {
      id: orderId,
      note: \`Rastreio: \${trackingData.tracking_code} | Entrega: \${trackingData.estimated_delivery_formatted}\`,
      tags: \`rastreio-gerado,pais-\${trackingData.country_code}\`,
      metafields: [
        { namespace:'tracking', key:'code',              value: trackingData.tracking_code,          type:'single_line_text_field' },
        { namespace:'tracking', key:'estimated_delivery',value: trackingData.estimated_delivery_date, type:'date' }
      ]
    }
  };
  const res = await axios.put(url, payload, {
    headers: { 'X-Shopify-Access-Token': store.accessToken, 'Content-Type': 'application/json' }
  });
  logger.info(\`✅ Shopify atualizado | Pedido \${orderId}\`);
  return res.data;
}

async function getOrder(storeDomain, orderId) {
  const store = getStoreConfig(storeDomain);
  if (!store) throw new Error(\`Loja não encontrada: \${storeDomain}\`);
  const res = await axios.get(
    \`https://\${store.domain}/admin/api/2024-01/orders/\${orderId}.json\`,
    { headers: { 'X-Shopify-Access-Token': store.accessToken } }
  );
  return res.data.order;
}

module.exports = { updateOrderTracking, getOrder, loadStores, getStoreConfig };`,

'src/services/stripeService.js': `const Stripe = require('stripe');
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
  logger.info(\`✅ Stripe atualizado | PI: \${piId}\`);
  return updated;
}

async function findPaymentIntentByOrderId(shopifyOrderId) {
  const list = await stripe.paymentIntents.search({
    query: \`metadata['shopify_order_id']:'\${shopifyOrderId}'\`, limit: 1
  });
  if (list.data.length > 0) return list.data[0];
  const charges = await stripe.charges.search({
    query: \`metadata['shopify_order_id']:'\${shopifyOrderId}'\`, limit: 1
  });
  if (charges.data.length > 0)
    return stripe.paymentIntents.retrieve(charges.data[0].payment_intent);
  logger.warn(\`⚠️ Payment Intent não encontrado para pedido \${shopifyOrderId}\`);
  return null;
}

async function markAsCancelled(piId, reason) {
  return stripe.paymentIntents.update(piId, {
    metadata: { tracking_status:'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason || 'Cancelado na Shopify' }
  });
}

module.exports = { updatePaymentIntent, findPaymentIntentByOrderId, markAsCancelled };`,

'src/services/emailService.js': `const sgMail = require('@sendgrid/mail');
const logger = require('../utils/logger');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendTrackingEmail(trackingData) {
  if (!trackingData.customer.email) return;
  await sgMail.send({
    to: trackingData.customer.email,
    from: { email: process.env.EMAIL_FROM, name: process.env.EMAIL_FROM_NAME },
    subject: \`Seu código de rastreio: \${trackingData.tracking_code}\`,
    html: \`<div style="font-family:sans-serif;background:#0a0a0f;color:#e0e0e0;padding:40px;border-radius:16px;max-width:600px;margin:auto">
      <h2 style="color:#00e5a0">📦 Pedido em processamento!</h2>
      <p>Olá, <strong>\${trackingData.customer.name}</strong>!</p>
      <p>Seu código de rastreio:</p>
      <div style="background:#0a0a0f;border:2px solid #00e5a0;border-radius:12px;padding:20px;text-align:center;margin:24px 0">
        <span style="font-size:28px;font-weight:700;color:#00e5a0;font-family:monospace;letter-spacing:3px">\${trackingData.tracking_code}</span>
      </div>
      <p>🌍 <strong>Destino:</strong> \${trackingData.country_name}</p>
      <p>📅 <strong>Entrega estimada:</strong> \${trackingData.estimated_delivery_formatted} (\${trackingData.estimated_days} dias úteis)</p>
    </div>\`
  });
  logger.info(\`📧 E-mail enviado para \${trackingData.customer.email}\`);
}

async function sendErrorAlert(error, context) {
  if (!process.env.EMAIL_FROM) return;
  await sgMail.send({
    to: process.env.EMAIL_FROM, from: process.env.EMAIL_FROM,
    subject: '⚠️ Erro no sistema de rastreio',
    html: \`<h2>Erro</h2><p><b>Contexto:</b> \${context}</p><p><b>Erro:</b> \${error.message}</p><pre>\${error.stack}</pre>\`
  }).catch(e => logger.error('Falha ao enviar alerta:', e));
}

module.exports = { sendTrackingEmail, sendErrorAlert };`,

'src/routes/webhooks.js': `const express = require('express');
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
    logger.info(\`📥 Novo pedido | \${storeDomain} | \${order.name}\`);
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
    logger.info(\`✅ Fluxo completo | \${trackingData.tracking_code}\`);
  } catch (err) {
    logger.error(\`❌ Erro pedido \${orderId}:\`, err.message);
    await sendErrorAlert(err, \`Pedido \${orderId} — \${storeDomain}\`);
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
    logger.info(\`✅ Cancelamento processado | \${orderId}\`);
  } catch (err) {
    logger.error(\`❌ Erro cancelamento \${orderId}:\`, err.message);
    await sendErrorAlert(err, \`Cancelamento \${orderId}\`);
  }
});

module.exports = router;`,

'src/routes/dashboard.js': `const express = require('express');
const router = express.Router();
const Tracking = require('../models/Tracking');

function auth(req, res, next) {
  const token = req.headers['x-dashboard-secret'] || req.query.secret;
  if (token !== process.env.DASHBOARD_SECRET)
    return res.status(401).json({ error: 'Não autorizado' });
  next();
}

router.get('/trackings', auth, async (req, res) => {
  try {
    const { store, status, country, search, page=1, limit=20 } = req.query;
    const q = {};
    if (store)   q.store = store;
    if (status)  q.status = status;
    if (country) q.country_code = country.toUpperCase();
    if (search)  q.$or = [
      { tracking_code: new RegExp(search,'i') },
      { shopify_order_number: new RegExp(search,'i') },
      { 'customer.email': new RegExp(search,'i') }
    ];
    const total = await Tracking.countDocuments(q);
    const data  = await Tracking.find(q).sort({ createdAt:-1 }).skip((page-1)*limit).limit(Number(limit));
    res.json({ total, page: Number(page), limit: Number(limit), data });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/trackings/:code', auth, async (req, res) => {
  try {
    const t = await Tracking.findOne({ tracking_code: req.params.code });
    if (!t) return res.status(404).json({ error: 'Não encontrado' });
    res.json(t);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const [total, byStatus, byCountry, byStore, recent] = await Promise.all([
      Tracking.countDocuments(),
      Tracking.aggregate([{ $group:{ _id:'$status', count:{ $sum:1 } } }]),
      Tracking.aggregate([{ $group:{ _id:'$country_code', count:{ $sum:1 } } },{ $sort:{ count:-1 } },{ $limit:10 }]),
      Tracking.aggregate([{ $group:{ _id:'$store', count:{ $sum:1 } } }]),
      Tracking.find().sort({ createdAt:-1 }).limit(5)
    ]);
    res.json({ total, byStatus, byCountry, byStore, recent });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;`,

'src/routes/health.js': `const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
router.get('/', (req, res) => res.json({
  status: 'ok',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
  mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
}));
module.exports = router;`,

'src/public/index.html': `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TrackCode — Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#070710;--s1:#0e0e1a;--s2:#13131f;--border:#1e1e30;--accent:#00e5a0;--accent2:#7c6cff;--accent3:#ff6c6c;--text:#e2e2f0;--muted:#5a5a7a}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:'Syne',sans-serif;min-height:100vh;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;z-index:0;background-image:linear-gradient(rgba(0,229,160,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,160,.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none}
#login{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:var(--bg)}
.login-box{background:var(--s1);border:1px solid var(--border);border-radius:20px;padding:48px;width:380px;text-align:center;box-shadow:0 0 60px rgba(124,108,255,.1)}
.login-box h1{font-size:28px;font-weight:800;margin-bottom:8px}.login-box h1 span{color:var(--accent)}
.login-box p{color:var(--muted);font-size:14px;margin-bottom:32px}
.login-box input{width:100%;background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;color:var(--text);font-family:'Space Mono',monospace;font-size:14px;outline:none;margin-bottom:16px;transition:.2s}
.login-box input:focus{border-color:var(--accent)}
.login-box button{width:100%;background:var(--accent);color:#070710;border:none;border-radius:10px;padding:14px;font-family:'Syne',sans-serif;font-size:16px;font-weight:700;cursor:pointer;transition:.2s}
.login-box button:hover{filter:brightness(1.1);transform:translateY(-1px)}
#login-err{color:var(--accent3);font-size:13px;margin-top:12px;display:none}
#app{display:none;position:relative;z-index:1}
.sidebar{position:fixed;left:0;top:0;bottom:0;width:220px;background:var(--s1);border-right:1px solid var(--border);padding:28px 20px;display:flex;flex-direction:column;gap:8px}
.logo{font-size:20px;font-weight:800;color:var(--accent);letter-spacing:2px;margin-bottom:28px}.logo span{color:var(--muted)}
.nav-item{padding:11px 14px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;color:var(--muted);transition:.15s;display:flex;align-items:center;gap:10px}
.nav-item:hover{background:var(--s2);color:var(--text)}
.nav-item.active{background:rgba(0,229,160,.1);color:var(--accent);border:1px solid rgba(0,229,160,.2)}
.main{margin-left:220px;padding:32px;min-height:100vh}
.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px}
.topbar h2{font-size:26px;font-weight:800}.topbar h2 span{color:var(--accent)}
.status-dot{width:8px;height:8px;background:var(--accent);border-radius:50%;display:inline-block;margin-right:6px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
.stat-card{background:var(--s1);border:1px solid var(--border);border-radius:16px;padding:24px;position:relative;overflow:hidden;transition:.2s}
.stat-card:hover{border-color:var(--accent);transform:translateY(-2px)}
.stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.stat-label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
.stat-value{font-size:36px;font-weight:800;font-family:'Space Mono',monospace}
.stat-icon{position:absolute;right:20px;top:50%;transform:translateY(-50%);font-size:40px;opacity:.08}
.panel{background:var(--s1);border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:24px}
.panel-header{padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.panel-header h3{font-size:16px;font-weight:700}
.search-bar{background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:8px 14px;color:var(--text);font-family:'Space Mono',monospace;font-size:13px;outline:none;width:260px;transition:.2s}
.search-bar:focus{border-color:var(--accent)}
table{width:100%;border-collapse:collapse}
th{padding:12px 20px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)}
td{padding:14px 20px;font-size:13px;border-bottom:1px solid rgba(30,30,48,.5)}
tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,.02)}
.code-badge{font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:var(--accent);background:rgba(0,229,160,.08);border:1px solid rgba(0,229,160,.2);padding:4px 10px;border-radius:6px;display:inline-block}
.status-badge{font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.5px;display:inline-block}
.s-created{background:rgba(124,108,255,.15);color:var(--accent2);border:1px solid rgba(124,108,255,.3)}
.s-in_transit{background:rgba(255,200,0,.1);color:#ffc800;border:1px solid rgba(255,200,0,.3)}
.s-delivered{background:rgba(0,229,160,.1);color:var(--accent);border:1px solid rgba(0,229,160,.3)}
.s-cancelled{background:rgba(255,108,108,.1);color:var(--accent3);border:1px solid rgba(255,108,108,.3)}
.bottom-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.country-bar{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)}
.country-bar:last-child{border-bottom:none}
.country-name{width:40px;font-family:'Space Mono',monospace;font-size:12px;color:var(--muted)}
.bar-track{flex:1;background:var(--s2);border-radius:4px;height:6px;overflow:hidden}
.bar-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:4px;transition:width 1s ease}
.bar-count{font-size:12px;color:var(--text);font-family:'Space Mono',monospace;width:30px;text-align:right}
.loader{text-align:center;padding:48px;color:var(--muted)}
.spinner{width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.fade-up{animation:fadeUp .4s ease forwards}
</style>
</head>
<body>
<div id="login">
  <div class="login-box">
    <h1>Track<span>Code</span></h1>
    <p>Sistema de Rastreio Inteligente</p>
    <input type="password" id="secret-input" placeholder="Chave de acesso"/>
    <button onclick="doLogin()">Entrar →</button>
    <div id="login-err">Chave inválida.</div>
  </div>
</div>
<div id="app">
  <div class="sidebar">
    <div class="logo">Track<span>Code</span></div>
    <div class="nav-item active" onclick="showTab('overview')"><span>⬡</span> Visão Geral</div>
    <div class="nav-item" onclick="showTab('trackings')"><span>◈</span> Rastreios</div>
    <div class="nav-item" onclick="showTab('countries')"><span>◎</span> Países</div>
  </div>
  <div class="main">
    <div class="topbar">
      <h2>Painel de <span>Rastreio</span></h2>
      <div style="font-size:13px;color:var(--muted)"><span class="status-dot"></span>Sistema ativo &nbsp;|&nbsp; <span id="clock" style="font-family:'Space Mono',monospace"></span></div>
    </div>
    <div id="tab-overview">
      <div class="stats-grid">
        <div class="stat-card fade-up"><div class="stat-icon">📦</div><div class="stat-label">Total</div><div class="stat-value" id="s-total">—</div></div>
        <div class="stat-card fade-up" style="animation-delay:.1s"><div class="stat-icon">✅</div><div class="stat-label">Entregues</div><div class="stat-value" id="s-delivered">—</div></div>
        <div class="stat-card fade-up" style="animation-delay:.2s"><div class="stat-icon">🚚</div><div class="stat-label">Em Trânsito</div><div class="stat-value" id="s-transit">—</div></div>
        <div class="stat-card fade-up" style="animation-delay:.3s"><div class="stat-icon">❌</div><div class="stat-label">Cancelados</div><div class="stat-value" id="s-cancelled">—</div></div>
      </div>
      <div class="panel fade-up" style="animation-delay:.4s">
        <div class="panel-header"><h3>Últimos Rastreios</h3></div>
        <div id="recent-table"><div class="loader"><div class="spinner"></div>Carregando...</div></div>
      </div>
    </div>
    <div id="tab-trackings" style="display:none">
      <div class="panel">
        <div class="panel-header"><h3>Todos os Rastreios</h3><input class="search-bar" id="search-input" placeholder="Buscar..." oninput="debounceSearch()"/></div>
        <div id="all-table"><div class="loader"><div class="spinner"></div>Carregando...</div></div>
      </div>
    </div>
    <div id="tab-countries" style="display:none">
      <div class="bottom-grid">
        <div class="panel"><div class="panel-header"><h3>Top Países</h3></div><div id="country-bars" style="padding:16px 24px"><div class="loader"><div class="spinner"></div></div></div></div>
        <div class="panel"><div class="panel-header"><h3>Por Status</h3></div><div id="status-bars" style="padding:16px 24px"><div class="loader"><div class="spinner"></div></div></div></div>
      </div>
    </div>
  </div>
</div>
<script>
let SECRET='';
setInterval(()=>{document.getElementById('clock').textContent=new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'medium'})},1000);
function doLogin(){
  SECRET=document.getElementById('secret-input').value.trim();
  fetchStats().then(()=>{document.getElementById('login').style.display='none';document.getElementById('app').style.display='block';loadOverview();}).catch(()=>{document.getElementById('login-err').style.display='block';});
}
document.getElementById('secret-input').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
async function api(p){const r=await fetch(p,{headers:{'x-dashboard-secret':SECRET}});if(!r.ok)throw new Error(r.status);return r.json();}
function showTab(n){['overview','trackings','countries'].forEach(t=>{document.getElementById('tab-'+t).style.display=t===n?'':'none';});document.querySelectorAll('.nav-item').forEach((el,i)=>{el.classList.toggle('active',['overview','trackings','countries'][i]===n);});if(n==='trackings')loadAll();if(n==='countries')loadCountries();}
async function fetchStats(){const d=await api('/api/stats');document.getElementById('s-total').textContent=d.total||0;const m={};d.byStatus.forEach(s=>m[s._id]=s.count);document.getElementById('s-delivered').textContent=m.delivered||0;document.getElementById('s-transit').textContent=m.in_transit||0;document.getElementById('s-cancelled').textContent=m.cancelled||0;return d;}
async function loadOverview(){fetchStats();const d=await api('/api/trackings?limit=8');document.getElementById('recent-table').innerHTML=buildTable(d.data);}
async function loadAll(q=''){const s=q?'&search='+encodeURIComponent(q):'';const d=await api('/api/trackings?limit=50'+s);document.getElementById('all-table').innerHTML=buildTable(d.data);}
let st;function debounceSearch(){clearTimeout(st);st=setTimeout(()=>loadAll(document.getElementById('search-input').value),400);}
function sl(s){return{created:'Criado',in_transit:'Em Trânsito',out_for_delivery:'Saiu p/ Entrega',delivered:'Entregue',cancelled:'Cancelado'}[s]||s;}
function buildTable(rows){if(!rows.length)return '<div class="loader">Nenhum rastreio encontrado.</div>';return '<table><thead><tr><th>Código</th><th>Pedido</th><th>Cliente</th><th>País</th><th>Entrega Est.</th><th>Status</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><span class="code-badge">'+r.tracking_code+'</span></td><td style="font-family:monospace;font-size:12px">'+(r.shopify_order_number||'—')+'</td><td><div>'+((r.customer&&r.customer.name)||'—')+'</div><div style="font-size:11px;color:var(--muted)">'+(r.customer&&r.customer.email||'')+'</div></td><td>'+r.country_code+' — '+(r.country_name||'')+'</td><td style="font-family:monospace;font-size:12px">'+(r.estimated_delivery_formatted||'—')+'</td><td><span class="status-badge s-'+r.status+'">'+sl(r.status)+'</span></td></tr>').join('')+'</tbody></table>';}
async function loadCountries(){const d=await api('/api/stats');const mx=Math.max(...d.byCountry.map(c=>c.count),1);document.getElementById('country-bars').innerHTML=d.byCountry.map(c=>'<div class="country-bar"><div class="country-name">'+c._id+'</div><div class="bar-track"><div class="bar-fill" style="width:'+(c.count/mx*100).toFixed(1)+'%"></div></div><div class="bar-count">'+c.count+'</div></div>').join('')||'<div style="color:var(--muted)">Sem dados.</div>';const sc={created:'var(--accent2)',in_transit:'#ffc800',delivered:'var(--accent)',cancelled:'var(--accent3)'};const ms=Math.max(...d.byStatus.map(s=>s.count),1);document.getElementById('status-bars').innerHTML=d.byStatus.map(s=>'<div class="country-bar"><div class="country-name" style="width:90px;font-family:Syne,sans-serif;font-size:12px;color:var(--text)">'+sl(s._id)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+(s.count/ms*100).toFixed(1)+'%;background:'+(sc[s._id]||'var(--accent)')+'"></div></div><div class="bar-count">'+s.count+'</div></div>').join('')||'<div style="color:var(--muted)">Sem dados.</div>';}
</script>
</body>
</html>`,

'README.md': `# ShopifyStripeTracking

Sistema de rastreio automático integrado com Shopify + Stripe.

## Instalação
\`\`\`bash
npm install
cp .env.example .env
# Edite o .env com suas chaves
npm run dev
\`\`\`

## Deploy (Railway)
1. Suba no GitHub
2. Conecte no railway.app
3. Configure as variáveis de ambiente
4. Deploy automático!

## Webhooks na Shopify
- Criação: POST /webhook/orders/create
- Cancelamento: POST /webhook/orders/cancelled

Veja o README completo nos arquivos gerados.`

};

// ── Cria todos os arquivos ──────────────────────
let created = 0;
for (const [filePath, content] of Object.entries(files)) {
  const dir = path.dirname(filePath);
  if (dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ ${filePath}`);
  created++;
}

// ── Cria pasta logs vazia ───────────────────────
fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync('logs/.gitkeep', '');

console.log(`\n🎉 Projeto criado com sucesso! (${created} arquivos)\n`);
console.log('Próximos passos:');
console.log('  1. npm install');
console.log('  2. cp .env.example .env  →  edite com suas chaves');
console.log('  3. npm run dev\n');
