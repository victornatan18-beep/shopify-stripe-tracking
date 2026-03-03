require('dotenv').config();
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
app.listen(PORT, () => logger.info(`🚀 Servidor rodando na porta ${PORT}`));
module.exports = app;