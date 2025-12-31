export const AGPAY_CONFIG = {
  currency: 'usd',

  // Tax is 8.875% by default (NYC example). Change as needed.
  taxRate: 0.08875,

  // MVP service fee: fixed 5 cents
  serviceFeeCents: 5,

  // Optional: round tax to nearest cent (recommended)
  roundToCents: true,
};
