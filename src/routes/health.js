const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
router.get('/', (req, res) => res.json({
  status: 'ok',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
  mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
}));
module.exports = router;