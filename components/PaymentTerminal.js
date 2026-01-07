// C:\vscode\AG\AGPay-Sand\components\PaymentTerminal.js
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

// -----------------------------
// AUTH TOKEN (JWT) HELPERS
// -----------------------------
async function readJwtToken() {
  // If you store JWT elsewhere, add the service name here.
  const candidates = ['userProfile', 'agpayAuth', 'authToken', 'session'];

  for (const service of candidates) {
    try {
      const creds = await Keychain.getInternetCredentials(service);
      if (!creds || !creds.password) continue;

      // Most of your app stores JSON in password
      let parsed = null;
      try {
        parsed = JSON.parse(creds.password);
      } catch {
        // If password is literally the token string, accept it
        if (
          typeof creds.password === 'string' &&
          creds.password.startsWith('eyJ')
        ) {
          return creds.password;
        }
        continue;
      }

      // Common shapes
      if (parsed?.token && typeof parsed.token === 'string')
        return parsed.token;
      if (parsed?.jwt && typeof parsed.jwt === 'string') return parsed.jwt;
      if (parsed?.accessToken && typeof parsed.accessToken === 'string')
        return parsed.accessToken;
    } catch (e) {
      console.log(`readJwtToken error for service=${service}:`, e);
    }
  }

  return null;
}

// -----------------------------
// BACKEND SAVE (DYNAMODB) HELPERS
// -----------------------------
const SAVE_TX_URL =
  'https://kvscjsddkd.execute-api.us-east-2.amazonaws.com/prod/VendioTransactions';

async function saveTxToBackend(finalTx) {
  try {
    const token = await readJwtToken();

    if (!token) {
      console.log(
        '❌ No JWT token found in Keychain. Cannot save transaction.',
      );
      Alert.alert('Auth Missing', 'No JWT token found. Please log in again.');
      return {ok: false, status: 0, error: 'Missing JWT'};
    }

    pretty('SAVE_TX finalTx =>', finalTx);

    const resp = await fetch(SAVE_TX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(finalTx),
    });

    const raw = await resp.text();
    console.log('SAVE_TX HTTP status:', resp.status);

    try {
      pretty('SAVE_TX response JSON:', JSON.parse(raw));
    } catch {
      console.log('SAVE_TX response text:', raw);
    }

    if (!resp.ok) {
      Alert.alert(
        'Save Failed',
        `Transaction save failed (HTTP ${resp.status}). Check logs.`,
      );
      return {ok: false, status: resp.status, error: raw};
    }

    let saved = null;
    try {
      saved = raw ? JSON.parse(raw) : null;
    } catch {}

    console.log('✅ Transaction saved to backend');
    return {ok: true, status: resp.status, saved};
  } catch (e) {
    console.log('saveTxToBackend error:', e);
    Alert.alert('Save Error', String(e?.message || e));
    return {ok: false, status: 0, error: String(e?.message || e)};
  }
}

// -----------------------------
// DESCRIPTION BUILDER
// -----------------------------
function buildDescription({selection, debugMeta, amountLabel}) {
  const parts = [];

  const corp = selection?.corporateName || null;
  const store = selection?.storeName || null;
  const note = debugMeta?.note || null;

  if (corp && store) parts.push(`${corp} / ${store}`);
  else if (corp) parts.push(String(corp));
  else if (store) parts.push(String(store));

  if (amountLabel) parts.push(String(amountLabel));

  if (note && String(note).trim()) parts.push(String(note).trim());

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

  // ✅ NEW: called after payment is confirmed successful
  onPaymentSuccess,
}) {
  const terminal = useStripeTerminal();

  const {
    connectedReader,
    collectPaymentMethod,
    retrievePaymentIntent,
    confirmPaymentIntent,

    collectRefundPaymentMethod,
    confirmRefund,
  } = terminal;

  const [loading, setLoading] = useState(false);

  const CREATE_INTENT_URL =
    'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/create-intent';

  // If you don't have it yet, keep this set to null; the refund button will show a helpful message.
  const CREATE_REFUND_URL = null;

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

    if (payload.refund && typeof payload.refund === 'object')
      return payload.refund;

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

      const selection = await readAgpaySelection();
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
        description,
        metadata,
      };

      pretty('Create-intent payload:', createPayload);

      const resp = await fetch(CREATE_INTENT_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(createPayload),
      });

      const rawText = await resp.text();
      console.log('Create-intent HTTP status:', resp.status);

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
      // FINAL TX OBJECT + SAVE TO KEYCHAIN + SAVE TO BACKEND
      // -------------------------------------------------------------------
      let receiptPayload = null;

      try {
        const charge0 =
          Array.isArray(confirmedPI?.charges) && confirmedPI.charges.length
            ? confirmedPI.charges[0]
            : null;

        const chargeId = charge0?.id || confirmedPI?.charge?.id || null;

        // These may or may not exist depending on SDK object shape.
        const brand =
          charge0?.payment_method_details?.card_present?.brand ||
          charge0?.payment_method_details?.card?.brand ||
          null;

        const last4 =
          charge0?.payment_method_details?.card_present?.last4 ||
          charge0?.payment_method_details?.card?.last4 ||
          null;

        const stripeReturnedObject = safeStringify(confirmedPI);

        const finalTx = {
          ownerId: selection?.ownerId || null,
          corporateRef: selection?.corporateRef || null,
          corporateName: selection?.corporateName || null,
          storeRef: selection?.storeRef || null,
          storeName: selection?.storeName || null,

          stripe: {
            paymentIntentId: confirmedPI?.id || null,
            status: confirmedPI?.status || null,
            amount: confirmedPI?.amount || null,
            currency: confirmedPI?.currency || null,
            paymentMethodId: confirmedPI?.paymentMethodId || null,
            chargeId,
          },

          stripeReturnedObject: stripeReturnedObject || null,

          amountLabel: amountLabel || null,
          debugMeta: debugMeta || null,

          descriptionSentToStripe: description || null,
          metadataSentToStripe: metadata || null,

          clientEpochMs: Date.now(),
        };

        console.log('================ FINAL AGPAY TX OBJECT ================');
        console.log(JSON.stringify(finalTx, null, 2));
        console.log('======================================================');

        await saveLastTx({
          chargeId: finalTx?.stripe?.chargeId || null,
          paymentIntentId: finalTx?.stripe?.paymentIntentId || null,
          amount: finalTx?.stripe?.amount || null,
          currency: finalTx?.stripe?.currency || null,
          clientEpochMs: finalTx?.clientEpochMs || Date.now(),
          stripeReturnedObject: finalTx?.stripeReturnedObject || null,
        });

        const saveResult = await saveTxToBackend(finalTx);

        if (saveResult?.ok && saveResult?.saved?.txnKey) {
          console.log('✅ Saved txnKey:', saveResult.saved.txnKey);
        }

        // ✅ Receipt payload for the next screen
        receiptPayload = {
          amountText: amountLabel || null,
          amountCents: amountCents || null,
          currency: currency || null,
          paymentId: finalTx?.stripe?.paymentIntentId || null,
          chargeId: finalTx?.stripe?.chargeId || null,
          brand,
          last4,
          note: debugMeta?.note || '',
          corporateName: selection?.corporateName || '',
          storeName: selection?.storeName || '',
          createdAtText: new Date().toLocaleString(),
        };
      } catch (e) {
        console.log('Final TX print/save error:', e);
      }

      Alert.alert('Success', `Payment completed: ${amountLabel || ''}`);

      // ✅ IMPORTANT: trigger navigation AFTER success alert is queued
      // Parent (App.js) will route to receipt + reset terminal to 0.00
      if (typeof onPaymentSuccess === 'function') {
        onPaymentSuccess(receiptPayload || {amountText: amountLabel || null});
      }
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

      if (
        typeof collectRefundPaymentMethod !== 'function' ||
        typeof confirmRefund !== 'function'
      ) {
        Alert.alert(
          'Refund not available in SDK',
          'Your installed @stripe/stripe-terminal-react-native version does not expose refund methods.',
        );
        return;
      }

      if (!CREATE_REFUND_URL) {
        Alert.alert(
          'Refund endpoint not set',
          'Set CREATE_REFUND_URL in PaymentTerminal.js to your backend refund-create endpoint.',
        );
        return;
      }

      const refundAmount = last?.amount;
      const refundCurrency = last?.currency || currency;
      const chargeId = last?.chargeId;

      if (!chargeId) {
        Alert.alert(
          'Missing chargeId',
          'Your saved last transaction does not include a chargeId.',
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

              if (!refund) {
                Alert.alert(
                  'Refund error',
                  'Backend did not return a refund object.',
                );
                setLoading(false);
                return;
              }

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
  helper: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
  },
});
