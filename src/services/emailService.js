const sgMail = require('@sendgrid/mail');
const logger = require('../utils/logger');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendTrackingEmail(trackingData) {
  if (!trackingData.customer.email) return;
  await sgMail.send({
    to: trackingData.customer.email,
    from: { email: process.env.EMAIL_FROM, name: process.env.EMAIL_FROM_NAME },
    subject: `Seu código de rastreio: ${trackingData.tracking_code}`,
    html: `<div style="font-family:sans-serif;background:#0a0a0f;color:#e0e0e0;padding:40px;border-radius:16px;max-width:600px;margin:auto">
      <h2 style="color:#00e5a0">📦 Pedido em processamento!</h2>
      <p>Olá, <strong>${trackingData.customer.name}</strong>!</p>
      <p>Seu código de rastreio:</p>
      <div style="background:#0a0a0f;border:2px solid #00e5a0;border-radius:12px;padding:20px;text-align:center;margin:24px 0">
        <span style="font-size:28px;font-weight:700;color:#00e5a0;font-family:monospace;letter-spacing:3px">${trackingData.tracking_code}</span>
      </div>
      <p>🌍 <strong>Destino:</strong> ${trackingData.country_name}</p>
      <p>📅 <strong>Entrega estimada:</strong> ${trackingData.estimated_delivery_formatted} (${trackingData.estimated_days} dias úteis)</p>
    </div>`
  });
  logger.info(`📧 E-mail enviado para ${trackingData.customer.email}`);
}

async function sendErrorAlert(error, context) {
  if (!process.env.EMAIL_FROM) return;
  await sgMail.send({
    to: process.env.EMAIL_FROM, from: process.env.EMAIL_FROM,
    subject: '⚠️ Erro no sistema de rastreio',
    html: `<h2>Erro</h2><p><b>Contexto:</b> ${context}</p><p><b>Erro:</b> ${error.message}</p><pre>${error.stack}</pre>`
  }).catch(e => logger.error('Falha ao enviar alerta:', e));
}

module.exports = { sendTrackingEmail, sendErrorAlert };