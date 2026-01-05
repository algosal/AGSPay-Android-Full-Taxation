// components/PaymentTerminal.js
import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  Alert,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {useStripeTerminal} from '@stripe/stripe-terminal-react-native';
import * as Keychain from 'react-native-keychain';

// -----------------------------
// LOG HELPERS (READABLE OUTPUT)
// -----------------------------
function pretty(label, obj) {
  try {
    console.log(label, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.log(label, obj);
  }
}

// Stripe objects are large + deeply nested; this keeps logs readable.
function summarizePI(pi) {
  if (!pi) return null;

  const charge0 = Array.isArray(pi.charges) ? pi.charges[0] : null;

  return {
    id: pi.id,
    status: pi.status,
    amount: pi.amount,
    currency: pi.currency,
    created: pi.created,
    paymentMethodId: pi.paymentMethodId,
    captureMethod: pi.captureMethod,
    sdkUuid: pi.sdkUuid,
    charge: charge0
      ? {
          id: charge0.id,
          status: charge0.status,
          amount: charge0.amount,
          currency: charge0.currency,
          paid: charge0.paid,
          outcome: charge0.outcome
            ? {
                networkStatus: charge0.outcome.network_status,
                type: charge0.outcome.type,
                riskLevel: charge0.outcome.risk_level,
                sellerMessage: charge0.outcome.seller_message,
              }
            : null,
        }
      : null,
  };
}

// Safely stringify possibly-circular objects.
// For Stripe PI objects, JSON.stringify should normally work, but MVP-safe is good.
function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    try {
      const seen = new WeakSet();
      return JSON.stringify(value, (key, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
        }
        return val;
      });
    } catch (e2) {
      console.log('safeStringify failed:', e2);
      return null;
    }
  }
}

// -----------------------------
// KEYCHAIN HELPERS
// -----------------------------
async function readAgpaySelection() {
  try {
    const creds = await Keychain.getInternetCredentials('agpaySelection');
    if (!creds || !creds.password) return null;
    return JSON.parse(creds.password);
  } catch (e) {
    console.log('readAgpaySelection error:', e);
    return null;
  }
}

async function saveLastTx(lastTx) {
  try {
    await Keychain.setInternetCredentials(
      'agpayLastTx',
      'lastTx',
      JSON.stringify(lastTx),
    );
    console.log('✅ Saved agpayLastTx');
  } catch (e) {
    console.log('saveLastTx error:', e);
  }
}

async function readLastTx() {
  try {
    const creds = await Keychain.getInternetCredentials('agpayLastTx');
    if (!creds || !creds.password) return null;
    return JSON.parse(creds.password);
  } catch (e) {
    console.log('readLastTx error:', e);
    return null;
  }
}

function buildDescription({selection, debugMeta, amountLabel}) {
  // Keep this short. Stripe description is best treated as a compact human string.
  // (Your Lambda also truncates/sanitizes.)
  const parts = [];

  const corp = selection?.corporateName || null;
  const store = selection?.storeName || null;
  const note = debugMeta?.note || null;

  if (corp && store) parts.push(`${corp} / ${store}`);
  else if (corp) parts.push(String(corp));
  else if (store) parts.push(String(store));

  if (amountLabel) parts.push(String(amountLabel));

  if (note && String(note).trim()) parts.push(String(note).trim());

  // Collapse whitespace and cap length (client-side cap; Lambda caps again)
  const s = parts.join(' · ').replace(/\s+/g, ' ').trim();
  return s.length > 250 ? s.slice(0, 249) + '…' : s;
}

// -----------------------------
// COMPONENT
// -----------------------------
export default function PaymentTerminal({
  amountCents, // REQUIRED: total cents to charge
  amountLabel, // e.g. "$10.94"
  currency = 'usd',
  theme,
  debugMeta, // arbitrary object to log with transaction (includes note)
}) {
  const terminal = useStripeTerminal();

  const {
    connectedReader,
    collectPaymentMethod,
    retrievePaymentIntent,
    confirmPaymentIntent,

    // Refund methods: may or may not exist depending on your installed SDK wrapper version.
    // If your version exposes different names, this file will still run and will show a friendly alert.
    collectRefundPaymentMethod,
    confirmRefund,
  } = terminal;

  const [loading, setLoading] = useState(false);

  const CREATE_INTENT_URL =
    'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/create-intent';

  // IMPORTANT:
  // Your backend must implement this endpoint to create a Refund object/server-side.
  // Typical payload: { chargeId, amount, currency }
  // Return shape should include a "refund" object (or body JSON containing it).
  //
  // If you don't have it yet, keep this set to null; the refund button will show a helpful message.
  const CREATE_REFUND_URL = null; // <-- set later, e.g. 'https://.../Stripe/stripe/create-refund'

  const t = useMemo(
    () => ({
      primary: theme?.primary ?? '#facc15',
      primaryText: theme?.primaryText ?? '#020617',
      text: theme?.text ?? '#ffffff',
      muted: theme?.muted ?? '#9ca3af',
      disabledBg: theme?.disabledBg ?? '#374151',
      disabledText: theme?.disabledText ?? '#9ca3af',
      danger: theme?.danger ?? '#ef4444',
    }),
    [theme],
  );

  function resolveClientSecretFromApi(payload) {
    if (!payload) return null;
    if (payload.client_secret) return payload.client_secret;
    if (payload.clientSecret) return payload.clientSecret;

    if (typeof payload.body === 'string') {
      try {
        const inner = JSON.parse(payload.body);
        return inner?.client_secret || inner?.clientSecret || null;
      } catch (e) {
        console.log('resolveClientSecret: parse error', e);
      }
    }

    if (payload.body && typeof payload.body === 'object') {
      return payload.body.client_secret || payload.body.clientSecret || null;
    }

    return null;
  }

  function resolveRefundFromApi(payload) {
    if (!payload) return null;

    // Common patterns:
    // 1) { refund: {...} }
    if (payload.refund && typeof payload.refund === 'object')
      return payload.refund;

    // 2) { body: "{\"refund\":{...}}" }
    if (typeof payload.body === 'string') {
      try {
        const inner = JSON.parse(payload.body);
        if (inner?.refund && typeof inner.refund === 'object')
          return inner.refund;
        return inner || null;
      } catch (e) {
        console.log('resolveRefundFromApi: parse error', e);
      }
    }

    // 3) { body: { refund: {...} } }
    if (payload.body && typeof payload.body === 'object') {
      if (payload.body.refund && typeof payload.body.refund === 'object')
        return payload.body.refund;
      return payload.body;
    }

    return null;
  }

  const handleCharge = async () => {
    try {
      if (!connectedReader) {
        Alert.alert('No reader connected', 'Connect Tap to Pay first.');
        return;
      }

      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        Alert.alert('Invalid total', 'Total must be greater than $0.00');
        return;
      }

      setLoading(true);

      console.log('================ AGPAY CHARGE START ================');
      pretty('CHARGE INPUT:', {amountCents, amountLabel, currency, debugMeta});

      // Get selection so we can attach description + metadata to the PI.
      const selection = await readAgpaySelection();

      // NEW: send description + metadata to your create-intent Lambda
      const description = buildDescription({selection, debugMeta, amountLabel});

      const metadata = {
        ownerId: selection?.ownerId || '',
        corporateRef: selection?.corporateRef || '',
        corporateName: selection?.corporateName || '',
        storeRef: selection?.storeRef || '',
        storeName: selection?.storeName || '',
        note: debugMeta?.note || '',
      };

      // 1) Create PaymentIntent via backend
      const createPayload = {
        amount: amountCents,
        currency,
        description, // stored in Stripe PaymentIntent
        metadata, // stored in Stripe PaymentIntent
      };

      pretty('Create-intent payload:', createPayload);

      const resp = await fetch(CREATE_INTENT_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(createPayload),
      });

      const rawText = await resp.text();
      console.log('Create-intent HTTP status:', resp.status);

      // Print raw response in readable form (if JSON)
      try {
        pretty('Create-intent raw response JSON:', JSON.parse(rawText));
      } catch {
        console.log('Create-intent raw response text:', rawText);
      }

      if (!resp.ok) {
        Alert.alert('Create failed', `HTTP ${resp.status}. Check logs.`);
        return;
      }

      let piData = null;
      try {
        piData = rawText ? JSON.parse(rawText) : null;
      } catch (e) {
        console.log('Create-intent JSON parse error:', e);
      }

      // Also show the parsed top-level structure
      pretty('Create-intent parsed:', piData);

      const clientSecret = resolveClientSecretFromApi(piData);
      console.log('Resolved clientSecret:', clientSecret);

      if (!clientSecret) {
        Alert.alert('Error', 'Backend did not return client_secret.');
        return;
      }

      // 2) Retrieve PI on device
      const {paymentIntent: retrievedPI, error: retrieveError} =
        await retrievePaymentIntent(clientSecret);

      pretty('retrievePaymentIntent:', {
        error: retrieveError
          ? {code: retrieveError.code, message: retrieveError.message}
          : null,
        paymentIntent: summarizePI(retrievedPI),
      });

      if (retrieveError) {
        Alert.alert(
          'Retrieve failed',
          retrieveError.message || 'Retrieve failed',
        );
        return;
      }

      // 3) Collect payment method
      Alert.alert('Ready', 'Tap a card on the phone to collect payment.');

      const {paymentIntent: collectedPI, error: collectError} =
        await collectPaymentMethod({paymentIntent: retrievedPI});

      pretty('collectPaymentMethod:', {
        error: collectError
          ? {code: collectError.code, message: collectError.message}
          : null,
        paymentIntent: summarizePI(collectedPI),
      });

      if (collectError) {
        Alert.alert('Collect failed', collectError.message || 'Collect failed');
        return;
      }

      // 4) Confirm PI
      const {paymentIntent: confirmedPI, error: confirmError} =
        await confirmPaymentIntent({paymentIntent: collectedPI});

      pretty('confirmPaymentIntent:', {
        error: confirmError
          ? {code: confirmError.code, message: confirmError.message}
          : null,
        paymentIntent: summarizePI(confirmedPI),
      });

      console.log('================ AGPAY CHARGE END ==================');

      if (confirmError) {
        Alert.alert('Confirm failed', confirmError.message || 'Confirm failed');
        return;
      }

      // -------------------------------------------------------------------
      // FINAL TX PRINT (NO BACKEND CALL YET)
      // -------------------------------------------------------------------
      try {
        const chargeId =
          (Array.isArray(confirmedPI?.charges) &&
            confirmedPI.charges[0] &&
            confirmedPI.charges[0].id) ||
          confirmedPI?.charge?.id ||
          null;

        // NEW: store raw Stripe returned object as JSON string (MVP).
        const stripeReturnedObject = safeStringify(confirmedPI);

        const finalTx = {
          // Selection context
          ownerId: selection?.ownerId || null,
          corporateRef: selection?.corporateRef || null,
          corporateName: selection?.corporateName || null,
          storeRef: selection?.storeRef || null,
          storeName: selection?.storeName || null,

          // Stripe result (confirmed)
          stripe: {
            paymentIntentId: confirmedPI?.id || null,
            status: confirmedPI?.status || null,
            amount: confirmedPI?.amount || null,
            currency: confirmedPI?.currency || null,
            paymentMethodId: confirmedPI?.paymentMethodId || null,
            chargeId,
          },

          // NEW FIELD (MVP): raw Stripe object returned from confirmPaymentIntent
          stripeReturnedObject: stripeReturnedObject || null,

          // Calculation + UI metadata
          amountLabel: amountLabel || null,
          debugMeta: debugMeta || null,

          // What we sent to Stripe at PI creation time
          descriptionSentToStripe: description || null,
          metadataSentToStripe: metadata || null,

          // Timestamp for traceability
          clientEpochMs: Date.now(),
        };

        console.log('================ FINAL AGPAY TX OBJECT ================');
        console.log(JSON.stringify(finalTx, null, 2));
        console.log('======================================================');

        // Save last transaction for refund (until DynamoDB endpoint is ready)
        await saveLastTx({
          chargeId: finalTx?.stripe?.chargeId || null,
          paymentIntentId: finalTx?.stripe?.paymentIntentId || null,
          amount: finalTx?.stripe?.amount || null,
          currency: finalTx?.stripe?.currency || null,
          clientEpochMs: finalTx?.clientEpochMs || Date.now(),

          // Optional but useful for MVP debugging
          stripeReturnedObject: finalTx?.stripeReturnedObject || null,
        });
      } catch (e) {
        console.log('Final TX print/save error:', e);
      }

      Alert.alert('Success', `Payment completed: ${amountLabel || ''}`);
    } catch (err) {
      console.log('handleCharge unexpected error:', err);
      Alert.alert('Error', String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleRefundLast = async () => {
    try {
      if (!connectedReader) {
        Alert.alert('No reader connected', 'Connect Tap to Pay first.');
        return;
      }

      const last = await readLastTx();
      console.log('REFUND lastTx =>', last);

      if (!last?.chargeId && !last?.paymentIntentId) {
        Alert.alert(
          'No saved transaction',
          'No last transaction found to refund yet. Complete a payment first.',
        );
        return;
      }

      // If refund methods aren’t available in your SDK wrapper, keep app stable and show a clear message.
      if (
        typeof collectRefundPaymentMethod !== 'function' ||
        typeof confirmRefund !== 'function'
      ) {
        Alert.alert(
          'Refund not available in SDK',
          'Your installed @stripe/stripe-terminal-react-native version does not expose refund methods. ' +
            'If you want, I can adjust the refund implementation to your exact SDK once you paste the terminal hook method list.',
        );
        return;
      }

      if (!CREATE_REFUND_URL) {
        Alert.alert(
          'Refund endpoint not set',
          'Set CREATE_REFUND_URL in PaymentTerminal.js to your backend refund-create endpoint, ' +
            'then refunds can be processed.',
        );
        return;
      }

      // For MVP: full refund of last amount
      const refundAmount = last?.amount;
      const refundCurrency = last?.currency || currency;
      const chargeId = last?.chargeId;

      if (!chargeId) {
        Alert.alert(
          'Missing chargeId',
          'Your saved last transaction does not include a chargeId. Please store chargeId after payment success.',
        );
        return;
      }

      Alert.alert(
        'Refund',
        `Refund last payment in full?\n\nAmount: ${refundAmount} ${String(
          refundCurrency,
        ).toUpperCase()}`,
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Refund',
            style: 'destructive',
            onPress: async () => {
              setLoading(true);

              console.log(
                '================ AGPAY REFUND START ================',
              );
              pretty('REFUND INPUT:', {
                chargeId,
                amount: refundAmount,
                currency: refundCurrency,
              });

              // 1) Create refund server-side (Stripe requires this)
              const refundResp = await fetch(CREATE_REFUND_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                  chargeId,
                  amount: refundAmount,
                  currency: refundCurrency,
                }),
              });

              const refundRaw = await refundResp.text();
              console.log('Create-refund HTTP status:', refundResp.status);

              try {
                pretty(
                  'Create-refund raw response JSON:',
                  JSON.parse(refundRaw),
                );
              } catch {
                console.log('Create-refund raw response text:', refundRaw);
              }

              if (!refundResp.ok) {
                Alert.alert(
                  'Refund create failed',
                  `HTTP ${refundResp.status}. Check logs.`,
                );
                setLoading(false);
                return;
              }

              let refundPayload = null;
              try {
                refundPayload = refundRaw ? JSON.parse(refundRaw) : null;
              } catch (e) {
                console.log('Create-refund JSON parse error:', e);
              }

              pretty('Create-refund parsed:', refundPayload);

              const refund = resolveRefundFromApi(refundPayload);
              console.log(
                'Resolved refund object:',
                refund ? 'present' : 'missing',
              );

              if (!refund) {
                Alert.alert(
                  'Refund error',
                  'Backend did not return a refund object. Adjust backend response to include { refund: {...} }.',
                );
                setLoading(false);
                return;
              }

              // 2) Collect refund payment method (tap card)
              Alert.alert('Ready', 'Tap the card on the phone to refund.');

              const {refund: collectedRefund, error: collectErr} =
                await collectRefundPaymentMethod({refund});

              pretty('collectRefundPaymentMethod:', {
                error: collectErr
                  ? {code: collectErr.code, message: collectErr.message}
                  : null,
                refund: collectedRefund || null,
              });

              if (collectErr) {
                Alert.alert(
                  'Refund collect failed',
                  collectErr.message || 'Refund collect failed',
                );
                setLoading(false);
                return;
              }

              // 3) Confirm refund
              const {refund: confirmedRefund, error: confirmErr} =
                await confirmRefund({refund: collectedRefund});

              pretty('confirmRefund:', {
                error: confirmErr
                  ? {code: confirmErr.code, message: confirmErr.message}
                  : null,
                refund: confirmedRefund || null,
              });

              console.log(
                '================ AGPAY REFUND END ==================',
              );

              if (confirmErr) {
                Alert.alert(
                  'Refund confirm failed',
                  confirmErr.message || 'Refund confirm failed',
                );
                setLoading(false);
                return;
              }

              Alert.alert('Refund Success', 'Refund completed successfully.');
              setLoading(false);
            },
          },
        ],
        {cancelable: true},
      );
    } catch (e) {
      console.log('handleRefundLast error:', e);
      Alert.alert('Refund error', String(e?.message || e));
    } finally {
      // If we didn’t enter the onPress async branch, ensure loading is false
      // (onPress branch sets its own loading lifecycle)
      setLoading(false);
    }
  };

  const disabled = !connectedReader || loading;

  return (
    <View style={styles.container}>
      <Text style={[styles.total, {color: t.text}]}>
        Total: <Text style={{color: t.primary}}>{amountLabel || '$0.00'}</Text>
      </Text>

      {/* CHARGE */}
      <TouchableOpacity
        onPress={handleCharge}
        disabled={disabled}
        style={[
          styles.btn,
          {backgroundColor: disabled ? t.disabledBg : t.primary},
        ]}>
        {loading ? (
          <ActivityIndicator size="small" />
        ) : (
          <Text
            style={[
              styles.btnText,
              {color: disabled ? t.disabledText : t.primaryText},
            ]}>
            Charge
          </Text>
        )}
      </TouchableOpacity>

      {/* REFUND LAST */}
      {/* <TouchableOpacity
        onPress={handleRefundLast}
        disabled={!connectedReader || loading}
        style={[
          styles.btnSecondary,
          {
            borderColor: !connectedReader || loading ? t.disabledBg : t.danger,
            opacity: !connectedReader || loading ? 0.6 : 1,
          },
        ]}>
        <Text
          style={[
            styles.btnSecondaryText,
            {color: !connectedReader || loading ? t.disabledText : t.danger},
          ]}>
          Refund Last Payment
        </Text>
      </TouchableOpacity> */}

      {!connectedReader && (
        <Text style={[styles.helper, {color: t.muted}]}>
          Connect Tap to Pay before charging or refunding.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  total: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 10,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '900',
  },
  btnSecondary: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '900',
  },
  helper: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
  },
});
