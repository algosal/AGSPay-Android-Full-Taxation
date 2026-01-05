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

// Normalizes chargeId across SDK shapes
function resolveChargeId(confirmedPI) {
  const fromChargesArray =
    Array.isArray(confirmedPI?.charges) &&
    confirmedPI.charges[0] &&
    confirmedPI.charges[0].id
      ? confirmedPI.charges[0].id
      : null;

  const fromChargeObject = confirmedPI?.charge?.id || null;

  return fromChargesArray || fromChargeObject || null;
}

export default function PaymentTerminal({
  amountCents, // REQUIRED: total cents to charge
  amountLabel, // e.g. "$10.94"
  currency = 'usd',
  theme,
  debugMeta, // arbitrary object to log with transaction
}) {
  const {
    connectedReader,
    collectPaymentMethod,
    retrievePaymentIntent,
    confirmPaymentIntent,
  } = useStripeTerminal();

  const [loading, setLoading] = useState(false);

  const CREATE_INTENT_URL =
    'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/create-intent';

  const t = useMemo(
    () => ({
      primary: theme?.primary ?? '#facc15',
      primaryText: theme?.primaryText ?? '#020617',
      text: theme?.text ?? '#ffffff',
      muted: theme?.muted ?? '#9ca3af',
      disabledBg: theme?.disabledBg ?? '#374151',
      disabledText: theme?.disabledText ?? '#9ca3af',
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

  // NOTE: Keep this local to PaymentTerminal for now, but standardized.
  async function readAgpaySelection() {
    try {
      // In bridgeless mode, InternetCredentials APIs behave best when you use the same key consistently.
      const creds = await Keychain.getInternetCredentials('agpaySelection');
      if (!creds || !creds.password) return null;

      // creds.password is your JSON string
      const parsed = JSON.parse(creds.password);
      return parsed || null;
    } catch (e) {
      console.log('readAgpaySelection error:', e);
      return null;
    }
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

      // 1) Create PaymentIntent via backend
      const createPayload = {amount: amountCents, currency};
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
        const selection = await readAgpaySelection();

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
            chargeId: resolveChargeId(confirmedPI),
          },

          // Calculation + UI metadata
          amountLabel: amountLabel || null,
          debugMeta: debugMeta || null,

          // Timestamp for traceability
          clientEpochMs: Date.now(),
        };

        console.log('================ FINAL AGPAY TX OBJECT ================');
        console.log(JSON.stringify(finalTx, null, 2));
        console.log('======================================================');
      } catch (e) {
        console.log('Final TX print error:', e);
      }

      Alert.alert('Success', `Payment completed: ${amountLabel || ''}`);
    } catch (err) {
      console.log('handleCharge unexpected error:', err);
      Alert.alert('Error', String(err?.message || err));
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
          Connect Tap to Pay before charging.
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
    paddingVertical: 10, // reduced height
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
