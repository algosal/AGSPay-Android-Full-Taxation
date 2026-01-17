import React, {forwardRef, useImperativeHandle, useMemo, useState} from 'react';
import {View, Text, Alert, StyleSheet, ActivityIndicator} from 'react-native';
import {useStripeTerminal} from '@stripe/stripe-terminal-react-native';
import * as Keychain from 'react-native-keychain';

function pretty(label, obj) {
  try {
    console.log(label, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.log(label, obj);
  }
}

function summarizePI(pi) {
  if (!pi) return null;
  const charge0 = Array.isArray(pi.charges) ? pi.charges[0] : null;
  return {
    id: pi.id,
    status: pi.status,
    amount: pi.amount,
    currency: pi.currency,
    paymentMethodId: pi.paymentMethodId,
    charge: charge0
      ? {
          id: charge0.id,
          status: charge0.status,
          amount: charge0.amount,
          currency: charge0.currency,
          paid: charge0.paid,
        }
      : null,
  };
}

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

async function saveLastReceipt(receiptPayload) {
  try {
    if (!receiptPayload) return;
    await Keychain.setInternetCredentials(
      'agpayLastReceipt',
      'receipt',
      JSON.stringify(receiptPayload),
    );
    console.log('✅ Saved agpayLastReceipt');
  } catch (e) {
    console.log('saveLastReceipt error:', e);
  }
}

async function readJwtToken() {
  const candidates = ['userProfile', 'agpayAuth', 'authToken', 'session'];

  for (const service of candidates) {
    try {
      const creds = await Keychain.getInternetCredentials(service);
      if (!creds || !creds.password) continue;

      let parsed = null;
      try {
        parsed = JSON.parse(creds.password);
      } catch {
        if (
          typeof creds.password === 'string' &&
          creds.password.startsWith('eyJ')
        ) {
          return creds.password;
        }
        continue;
      }

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

    if (!resp.ok) {
      console.log('SAVE_TX failed:', raw);
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
    return {ok: false, status: 0, error: String(e?.message || e)};
  }
}

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

const PaymentTerminal = forwardRef(function PaymentTerminal(
  {
    amountCents,
    amountLabel,
    currency = 'usd',
    theme,
    debugMeta,
    breakdown,
    onPaymentSuccess,
  },
  ref,
) {
  const terminal = useStripeTerminal();
  const {
    connectedReader,
    collectPaymentMethod,
    retrievePaymentIntent,
    confirmPaymentIntent,
  } = terminal;

  const [loading, setLoading] = useState(false);

  const CREATE_INTENT_URL =
    'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/create-intent';

  const t = useMemo(
    () => ({
      text: theme?.text ?? '#ffffff',
      muted: theme?.muted ?? '#9ca3af',
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

  const startCardPayment = async () => {
    try {
      if (loading) return;

      if (!connectedReader) {
        Alert.alert('No reader connected', 'Connect Tap to Pay first.');
        return;
      }

      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        Alert.alert(
          'Enter amount',
          'Please enter an amount greater than $0.00.',
        );
        return;
      }

      setLoading(true);

      console.log('================ AGPAY CARD START ================');
      console.log('CHARGING FULL amountCents =', amountCents);
      pretty('BREAKDOWN USED:', breakdown);

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

      const createPayload = {
        amount: amountCents, // ✅ MUST be full total
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

      if (!resp.ok) {
        console.log('Create-intent failed:', rawText);
        Alert.alert('Create failed', `HTTP ${resp.status}. Check logs.`);
        return;
      }

      let piData = null;
      try {
        piData = rawText ? JSON.parse(rawText) : null;
      } catch {}

      const clientSecret = resolveClientSecretFromApi(piData);
      if (!clientSecret) {
        Alert.alert('Error', 'Backend did not return client_secret.');
        return;
      }

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

      const {paymentIntent: confirmedPI, error: confirmError} =
        await confirmPaymentIntent({paymentIntent: collectedPI});

      pretty('confirmPaymentIntent:', {
        error: confirmError
          ? {code: confirmError.code, message: confirmError.message}
          : null,
        paymentIntent: summarizePI(confirmedPI),
      });

      if (confirmError) {
        Alert.alert('Confirm failed', confirmError.message || 'Confirm failed');
        return;
      }

      console.log('================ AGPAY CARD END ==================');

      let receiptPayload = null;

      try {
        const charge0 =
          Array.isArray(confirmedPI?.charges) && confirmedPI.charges.length
            ? confirmedPI.charges[0]
            : null;

        const chargeId = charge0?.id || confirmedPI?.charge?.id || null;

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

        await saveTxToBackend(finalTx);

        receiptPayload = {
          paymentMethod: 'CARD',
          createdAtText: new Date().toLocaleString(),
          note: debugMeta?.note || '',

          corporateName: selection?.corporateName || '',
          storeName: selection?.storeName || '',

          currency: currency || null,
          paymentId: finalTx?.stripe?.paymentIntentId || null,
          chargeId: finalTx?.stripe?.chargeId || null,
          brand,
          last4,

          // ✅ MUST use breakdown
          subtotalCents: Number(breakdown?.subtotalCents ?? 0),
          taxCents: Number(breakdown?.taxCents ?? 0),
          albaFeeCents: Number(breakdown?.albaFeeCents ?? 0),
          tipCents: Number(breakdown?.tipCents ?? 0),

          totalCents: Number(breakdown?.totalCents ?? amountCents ?? 0),
          grandTotalCents: Number(breakdown?.totalCents ?? amountCents ?? 0),

          amountCents: Number(breakdown?.totalCents ?? amountCents ?? 0),
          amountText: amountLabel || null,
        };

        await saveLastReceipt(receiptPayload);
      } catch (e) {
        console.log('Final TX receipt/save error:', e);
      }

      Alert.alert('Success', `Card payment completed: ${amountLabel || ''}`);

      onPaymentSuccess?.(receiptPayload || {amountText: amountLabel || null});
    } catch (err) {
      console.log('startCardPayment unexpected error:', err);
      Alert.alert('Error', String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    startCardPayment,
    isBusy: () => loading,
  }));

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={[styles.loadingText, {color: t.text}]}>
            Processing card payment…
          </Text>
        </View>
      ) : null}

      {!connectedReader && (
        <Text style={[styles.helper, {color: t.muted}]}>
          Connect Tap to Pay before taking card payments.
        </Text>
      )}
    </View>
  );
});

export default PaymentTerminal;

const styles = StyleSheet.create({
  container: {marginTop: 10},
  helper: {marginTop: 8, fontSize: 12, textAlign: 'center'},
  loadingRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  loadingText: {fontSize: 13, fontWeight: '800'},
});
