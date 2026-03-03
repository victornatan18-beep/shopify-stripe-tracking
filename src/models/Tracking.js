const mongoose = require('mongoose');
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

module.exports = mongoose.model('Tracking', trackingSchema);