// components/PaymentTerminal.js
import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {useStripeTerminal} from '@stripe/stripe-terminal-react-native';

export default function PaymentTerminal({
  defaultAmount = 10,
  theme,
  containerStyle,
  titleStyle,
}) {
  const {
    connectedReader,
    collectPaymentMethod,
    retrievePaymentIntent,
    confirmPaymentIntent,
  } = useStripeTerminal();

  const [amountInput, setAmountInput] = useState(String(defaultAmount));
  const [loading, setLoading] = useState(false);

  const CREATE_INTENT_URL =
    'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/create-intent';

  // Theme defaults (so this component is usable even without props)
  const t = useMemo(
    () => ({
      text: theme?.text ?? '#f9fafb',
      subtext: theme?.subtext ?? '#d1d5db',
      muted: theme?.muted ?? '#9ca3af',
      border: theme?.border ?? '#374151',
      inputBg: theme?.inputBg ?? '#0b1220',
      screenBg: theme?.screenBg ?? 'transparent',
      primary: theme?.primary ?? '#facc15',
      primaryText: theme?.primaryText ?? '#111827',
      danger: theme?.danger ?? '#ef4444',
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
        if (inner?.client_secret) return inner.client_secret;
        if (inner?.clientSecret) return inner.clientSecret;
      } catch (e) {
        console.log(
          'resolveClientSecret: failed to parse payload.body JSON:',
          e,
        );
      }
    }

    if (payload.body && typeof payload.body === 'object') {
      if (payload.body.client_secret) return payload.body.client_secret;
      if (payload.body.clientSecret) return payload.body.clientSecret;
    }

    return null;
  }

  const handleCharge = async () => {
    let parsed = null;

    try {
      if (!connectedReader) {
        Alert.alert(
          'No reader connected',
          'Please connect Tap to Pay on this phone first.',
        );
        return;
      }

      parsed = parseFloat(String(amountInput).replace(',', '.'));
      if (Number.isNaN(parsed) || parsed <= 0) {
        Alert.alert(
          'Invalid amount',
          'Please enter a valid amount greater than 0.',
        );
        return;
      }

      const amountInCents = Math.round(parsed * 100);
      setLoading(true);

      const resp = await fetch(CREATE_INTENT_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({amount: amountInCents, currency: 'usd'}),
      });

      const rawText = await resp.text();

      if (!resp.ok) {
        Alert.alert(
          'Create PaymentIntent failed',
          `HTTP ${resp.status}. Check logs.`,
        );
        return;
      }

      let piData = null;
      try {
        piData = rawText ? JSON.parse(rawText) : null;
      } catch (e) {
        console.log('Failed to parse create-intent JSON:', e);
      }

      const clientSecret = resolveClientSecretFromApi(piData);
      if (!clientSecret) {
        Alert.alert('Error', 'Backend did not return client_secret.');
        return;
      }

      const {paymentIntent: retrievedPI, error: retrieveError} =
        await retrievePaymentIntent(clientSecret);

      if (retrieveError) {
        Alert.alert(
          'Retrieve failed',
          retrieveError.message || 'Failed to retrieve PI.',
        );
        return;
      }

      Alert.alert('Ready', 'Tap a card on the phone to collect payment.');

      const {paymentIntent: collectedPI, error: collectError} =
        await collectPaymentMethod({paymentIntent: retrievedPI});

      if (collectError) {
        Alert.alert(
          'Collect failed',
          collectError.message || 'Failed to collect.',
        );
        return;
      }

      const {paymentIntent: confirmedPI, error: confirmError} =
        await confirmPaymentIntent({paymentIntent: collectedPI});

      if (confirmError) {
        Alert.alert(
          'Confirm failed',
          confirmError.message || 'Failed to confirm.',
        );
        return;
      }

      Alert.alert('Success', `Payment of $${parsed.toFixed(2)} completed.`);
    } catch (err) {
      console.log('handleCharge unexpected error:', err);
      Alert.alert('Error', String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const disabled = !connectedReader || loading;

  return (
    <View
      style={[styles.container, {backgroundColor: t.screenBg}, containerStyle]}>
      <Text style={[styles.title, {color: t.text}, titleStyle]}>
        Charge Customer
      </Text>

      <Text style={[styles.label, {color: t.subtext}]}>Connected reader:</Text>
      <Text style={[styles.value, {color: t.text}]}>
        {connectedReader
          ? connectedReader.label || 'Tap to Pay (Phone)'
          : 'None'}
      </Text>

      <Text style={[styles.label, {marginTop: 16, color: t.subtext}]}>
        Amount (USD):
      </Text>

      <View style={styles.row}>
        <Text style={[styles.dollar, {color: t.text}]}>$</Text>
        <TextInput
          style={[
            styles.input,
            {borderColor: t.border, backgroundColor: t.inputBg, color: t.text},
          ]}
          keyboardType="numeric"
          value={amountInput}
          onChangeText={setAmountInput}
          placeholder="10"
          placeholderTextColor={t.muted}
        />
      </View>

      <View style={{marginTop: 16}}>
        <TouchableOpacity
          onPress={handleCharge}
          disabled={disabled}
          style={[
            styles.primaryBtn,
            {backgroundColor: disabled ? t.disabledBg : t.primary},
          ]}>
          {loading ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text
              style={[
                styles.primaryBtnText,
                {color: disabled ? t.disabledText : t.primaryText},
              ]}>
              {`Charge $${amountInput || defaultAmount}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {!connectedReader && (
        <Text style={[styles.helper, {color: t.muted}]}>
          Connect Tap to Pay on this phone before charging.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    width: '100%',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    opacity: 0.9,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  dollar: {
    fontSize: 20,
    marginRight: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    minWidth: 140,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  helper: {
    marginTop: 10,
    fontSize: 12,
    textAlign: 'center',
  },
});
