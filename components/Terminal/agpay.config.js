export const AGPAY_CONFIG = {
  currency: 'usd',
  taxRate: 0.08875,
  roundToCents: true,

  // Stripe baseline (pass-through)
  stripeFeeRate: 0.027,
  stripeFeeFixedCents: 5,

  // AGPay service fee (smooth ramp: 5¢ → $1.00 at $100, then cap)
  agFeeMinCents: 5,

  agFeeMaxCents: 50,
  agFeeSlopeRate: 0.0045, // (50 - 5) / 10000
};
