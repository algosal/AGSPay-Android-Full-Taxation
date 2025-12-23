// components/PaymentTerminal.js
import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {useStripeTerminal} from '@stripe/stripe-terminal-react-native';

export default function PaymentTerminal({defaultAmount = 10}) {
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

  function resolveClientSecretFromApi(payload) {
    if (!payload) return null;

    // Preferred: { client_secret: "..." }
    if (payload.client_secret) return payload.client_secret;
    if (payload.clientSecret) return payload.clientSecret;

    // Sometimes (non-proxy mapping): { body: "{\"client_secret\":\"...\"}" }
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

    // Sometimes: { body: { client_secret: "..." } }
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

      console.log('------------------------------------------');
      console.log('Creating Terminal PaymentIntent (cents):', amountInCents);

      // 1) Ask backend to create a Terminal PaymentIntent
      const resp = await fetch(CREATE_INTENT_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        // Flat body (recommended)
        body: JSON.stringify({
          amount: amountInCents,
          currency: 'usd',
        }),
      });

      const rawText = await resp.text();
      console.log('Create-intent HTTP status:', resp.status);
      console.log('Create-intent raw response text:', rawText);

      if (!resp.ok) {
        Alert.alert(
          'Create PaymentIntent failed',
          `HTTP ${resp.status}. Check logs for details.`,
        );
        return;
      }

      let piData = null;
      try {
        piData = rawText ? JSON.parse(rawText) : null;
      } catch (e) {
        console.log('Failed to parse create-intent JSON:', e);
      }

      console.log('Create PaymentIntent parsed response:', piData);

      const clientSecret = resolveClientSecretFromApi(piData);
      console.log('Resolved clientSecret:', clientSecret);

      if (!clientSecret) {
        Alert.alert(
          'Error',
          'Backend did not return client_secret. Fix API Gateway mapping or Lambda response.',
        );
        return;
      }

      // 2) Retrieve PaymentIntent on device
      const {paymentIntent: retrievedPI, error: retrieveError} =
        await retrievePaymentIntent(clientSecret);

      if (retrieveError) {
        console.log('retrievePaymentIntent error:', retrieveError);
        Alert.alert(
          'Retrieve failed',
          retrieveError.message ||
            'Failed to retrieve PaymentIntent on device.',
        );
        return;
      }

      console.log('Retrieved PaymentIntent:', retrievedPI);

      // 3) Collect payment method (Tap to Pay on phone)
      Alert.alert('Ready', 'Tap a card on the phone to collect payment.');

      const {paymentIntent: collectedPI, error: collectError} =
        await collectPaymentMethod({paymentIntent: retrievedPI});

      if (collectError) {
        console.log('collectPaymentMethod error:', collectError);
        Alert.alert(
          'Collect failed',
          collectError.message || 'Failed to collect payment method.',
        );
        return;
      }

      console.log('Collected payment method. PI:', collectedPI);

      // 4) Confirm PaymentIntent
      const {paymentIntent: confirmedPI, error: confirmError} =
        await confirmPaymentIntent({paymentIntent: collectedPI});

      if (confirmError) {
        console.log('confirmPaymentIntent error:', confirmError);
        Alert.alert(
          'Confirm failed',
          confirmError.message || 'Failed to confirm payment.',
        );
        return;
      }

      console.log('Confirmed PaymentIntent:', confirmedPI);

      Alert.alert('Success', `Payment of $${parsed.toFixed(2)} completed.`);
    } catch (err) {
      console.log('handleCharge unexpected error:', err);
      Alert.alert('Error', String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Charge Customer</Text>

      <Text style={styles.label}>Connected reader:</Text>
      <Text style={styles.value}>
        {connectedReader
          ? connectedReader.label || 'Tap to Pay (Phone)'
          : 'None'}
      </Text>

      <Text style={[styles.label, {marginTop: 16, color: 'white'}]}>
        Amount (USD):
      </Text>

      <View style={styles.row}>
        <Text style={styles.dollar}>$</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={amountInput}
          onChangeText={setAmountInput}
          placeholder="10"
          placeholderTextColor="#888"
        />
      </View>

      <View style={{marginTop: 20}}>
        {loading ? (
          <ActivityIndicator size="small" />
        ) : (
          <Button
            title={`Charge $${amountInput || defaultAmount}`}
            onPress={handleCharge}
            disabled={!connectedReader}
          />
        )}
      </View>

      {!connectedReader && (
        <Text style={styles.helper}>
          Connect Tap to Pay on this phone before charging.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    width: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
    color: 'white',
  },
  label: {
    fontSize: 14,
    opacity: 0.85,
    color: '#d1d5db',
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: '#f9fafb',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  dollar: {
    fontSize: 20,
    marginRight: 4,
    color: 'white',
  },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 18,
    minWidth: 120,
    color: 'white',
    backgroundColor: '#020617',
  },
  helper: {
    marginTop: 10,
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
