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

  const handleCharge = async () => {
    try {
      if (!connectedReader) {
        Alert.alert(
          'No reader connected',
          'Please connect the Tap to Pay reader first.',
        );
        return;
      }

      const parsed = parseFloat(amountInput.replace(',', '.'));
      if (isNaN(parsed) || parsed <= 0) {
        Alert.alert('Invalid amount', 'Please enter a valid amount.');
        return;
      }

      const amountInCents = Math.round(parsed * 100);
      setLoading(true);

      console.log('Creating PaymentIntent for amount (cents):', amountInCents);

      // 1️⃣ Ask backend to create a PaymentIntent for Terminal
      const resp = await fetch(
        'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/create-intent',
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            amount: amountInCents,
            currency: 'usd',
          }),
        },
      );

      if (!resp.ok) {
        const text = await resp.text();
        console.log('Create PI HTTP error:', resp.status, text);
        Alert.alert('Error', 'Failed to create PaymentIntent.');
        setLoading(false);
        return;
      }

      const piData = await resp.json();
      console.log('Create PaymentIntent response:', piData);

      // Outer shape: { statusCode, headers, body: "{\"client_secret\":\"...\"}" }
      let clientSecret = null;

      try {
        if (typeof piData.body === 'string') {
          const inner = JSON.parse(piData.body);
          console.log('Parsed inner PI body:', inner);
          clientSecret = inner.client_secret || inner.clientSecret || null;
        } else if (piData.client_secret || piData.clientSecret) {
          clientSecret = piData.client_secret || piData.clientSecret;
        }
      } catch (e) {
        console.log('Error parsing PaymentIntent inner body:', e);
      }

      console.log('Resolved clientSecret from backend:', clientSecret);

      if (!clientSecret) {
        Alert.alert(
          'Error',
          'Backend did not return a client_secret for the PaymentIntent.',
        );
        setLoading(false);
        return;
      }

      // 2️⃣ Retrieve the PaymentIntent using the client_secret
      const {paymentIntent: retrievedPI, error: retrieveError} =
        await retrievePaymentIntent(clientSecret);

      if (retrieveError) {
        console.log('retrievePaymentIntent error:', retrieveError);
        Alert.alert(
          'Retrieve failed',
          retrieveError.message ||
            'Failed to retrieve PaymentIntent on the device.',
        );
        setLoading(false);
        return;
      }

      console.log('Retrieved PaymentIntent:', retrievedPI);

      // 3️⃣ Collect the payment method using the reader
      Alert.alert(
        'Ready',
        'Tap a (test) card on the device to collect the payment method.',
      );

      const {paymentIntent: collectedPI, error: collectError} =
        await collectPaymentMethod({paymentIntent: retrievedPI});

      if (collectError) {
        console.log('collectPaymentMethod error:', collectError);
        Alert.alert(
          'Collect failed',
          collectError.message || 'Failed to collect payment method.',
        );
        setLoading(false);
        return;
      }

      console.log('Collected payment method. PaymentIntent:', collectedPI);

      // 4️⃣ Confirm the payment
      const {paymentIntent: confirmedPI, error: confirmError} =
        await confirmPaymentIntent({paymentIntent: collectedPI});

      if (confirmError) {
        console.log('confirmPaymentIntent error:', confirmError);
        Alert.alert(
          'Confirm failed',
          confirmError.message || 'Failed to confirm payment.',
        );
        setLoading(false);
        return;
      }

      console.log('Confirmed PaymentIntent:', confirmedPI);
      Alert.alert('Success', `Payment of $${parsed.toFixed(2)} completed ✅`);
    } catch (err) {
      console.log('handleCharge error:', err);
      Alert.alert('Error', String(err));
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
          ? connectedReader.label || 'Simulated Tap to Pay reader'
          : 'None'}
      </Text>

      <Text style={[styles.label, {marginTop: 16}]}>Amount (USD):</Text>
      <View style={styles.row}>
        <Text style={styles.dollar}>$</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={amountInput}
          onChangeText={setAmountInput}
          placeholder="10"
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
          Connect the Tap to Pay reader above before charging.
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
  },
  label: {
    fontSize: 14,
    opacity: 0.8,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  dollar: {
    fontSize: 20,
    marginRight: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 18,
    minWidth: 80,
  },
  helper: {
    marginTop: 10,
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
});
