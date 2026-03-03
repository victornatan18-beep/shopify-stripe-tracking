const express = require('express');
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

module.exports = router;