// components/PaymentTerminal.js
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {Alert, PermissionsAndroid, Platform} from 'react-native';
import * as Keychain from 'react-native-keychain';
import {
  useStripeTerminal,
  TapZoneIndicator,
  DarkMode,
} from '@stripe/stripe-terminal-react-native';

const CREATE_INTENT_URL =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/create-intent';

// ✅ set true temporarily for simulation
const FORCE_SIMULATED_READER = false;

// ✅ Your LIVE Location ID
const LIVE_LOCATION_ID = 'tml_GUcKvwB8ozD1jO';

async function requestLocationPermissionIfNeeded() {
  if (Platform.OS !== 'android') return true;

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location Permission',
      message: 'AGPay uses location to enable Tap to Pay.',
      buttonPositive: 'OK',
    },
  );

  if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
    Alert.alert('Permission required', 'Location permission is required.');
    return false;
  }
  return true;
}

async function readAgpayAuthToken() {
  try {
    const creds = await Keychain.getInternetCredentials('agpayAuth');
    if (!creds?.password) return null;
    const parsed = JSON.parse(creds.password);
    return parsed?.token || null; // raw JWT
  } catch (e) {
    console.log('readAgpayAuthToken error:', e);
    return null;
  }
}

async function createIntentOnBackend({amountCents, currency, metadata}) {
  const jwt = await readAgpayAuthToken();

  const payload = {
    amount: Number(amountCents || 0),
    currency: String(currency || 'usd'),
    metadata: metadata || {},
  };

  console.log('💳 create-intent → POST:', CREATE_INTENT_URL, payload);

  const resp = await fetch(CREATE_INTENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? {Authorization: jwt} : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  console.log('💳 create-intent → HTTP:', resp.status, text);

  if (!resp.ok) throw new Error(`Create intent failed: HTTP ${resp.status}`);

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  const clientSecret =
    data?.client_secret ||
    data?.clientSecret ||
    data?.payment_intent?.client_secret ||
    data?.paymentIntent?.client_secret ||
    data?.paymentIntent?.clientSecret;

  if (!clientSecret) {
    console.log('❌ create-intent missing client_secret:', data);
    throw new Error('Missing client_secret from create-intent response');
  }

  return {clientSecret, raw: data};
}

async function readAgpaySelection() {
  try {
    const creds = await Keychain.getInternetCredentials('agpaySelection');
    if (!creds?.password) return null;
    return JSON.parse(creds.password);
  } catch (e) {
    console.log('readAgpaySelection error:', e);
    return null;
  }
}

const PaymentTerminal = forwardRef(
  (
    {
      onReaderStatusChange,
      onPaymentSuccess,
      debugMeta,
      breakdown,
      amountCents = 0,
      currency = 'usd',
      amountLabel,
    },
    ref,
  ) => {
    const {
      initialize,
      discoverReaders,
      connectReader,
      disconnectReader,
      connectedReader,
      discoveredReaders,
      cancelDiscovering,
      setTapToPayUxConfiguration,
      supportsReadersOfType,
      setSimulatedCard,
      retrievePaymentIntent,
      collectPaymentMethod,
      confirmPaymentIntent,
    } = useStripeTerminal({
      onUpdateDiscoveredReaders: readers => {
        console.log('onUpdateDiscoveredReaders:', readers);
      },
    });

    const [terminalReady, setTerminalReady] = useState(false);
    const [statusLine, setStatusLine] = useState('Not initialized');

    const latestReadersRef = useRef([]);
    const tapToPaySupportedRef = useRef(null);

    useEffect(() => {
      if (Array.isArray(discoveredReaders)) {
        latestReadersRef.current = discoveredReaders;
      }
    }, [discoveredReaders]);

    const publishReaderStatus = useCallback(
      next => {
        onReaderStatusChange?.(next);
      },
      [onReaderStatusChange],
    );

    const ensureInit = useCallback(async () => {
      if (terminalReady) return true;

      console.log('Stripe Terminal → initialize() start');
      setStatusLine('Initializing Stripe Terminal…');

      const res = await initialize();
      console.log('Stripe Terminal → initialize() result:', res);

      if (res?.error) {
        setStatusLine(`Init failed: ${res.error?.message || res.error?.code}`);
        throw new Error(
          res.error?.message || 'Stripe Terminal initialize failed',
        );
      }

      try {
        await setTapToPayUxConfiguration({
          tapZone: {
            tapZoneIndicator: TapZoneIndicator.FRONT,
            tapZonePosition: {xBias: 0.5, yBias: 0.3},
          },
          darkMode: DarkMode.DARK,
        });
      } catch (e) {
        console.log('setTapToPayUxConfiguration error:', e);
      }

      try {
        const r = await supportsReadersOfType({
          deviceType: 'tapToPay',
          discoveryMethod: 'tapToPay',
        });
        tapToPaySupportedRef.current = r?.supported ?? null;
      } catch (e) {
        console.log('supportsReadersOfType error:', e);
        tapToPaySupportedRef.current = null;
      }

      setTerminalReady(true);
      setStatusLine('Initialized');
      return true;
    }, [
      initialize,
      setTapToPayUxConfiguration,
      supportsReadersOfType,
      terminalReady,
    ]);

    const connectReaderFlow = useCallback(async () => {
      try {
        await ensureInit();

        const ok = await requestLocationPermissionIfNeeded();
        if (!ok) return;

        const supported = tapToPaySupportedRef.current;
        if (supported === false && !FORCE_SIMULATED_READER) {
          Alert.alert(
            'Not supported',
            'This device does not support Tap to Pay.',
          );
          return;
        }

        if (!FORCE_SIMULATED_READER) {
          if (
            !LIVE_LOCATION_ID ||
            !String(LIVE_LOCATION_ID).startsWith('tml_')
          ) {
            Alert.alert(
              'Location ID missing',
              'LIVE_LOCATION_ID must be a valid Stripe Terminal Location (tml_...).',
            );
            return;
          }
        }

        setStatusLine('Discovering Tap to Pay…');

        const {error: discErr} = await discoverReaders({
          discoveryMethod: 'tapToPay',
          simulated: !!FORCE_SIMULATED_READER,
        });

        if (discErr) {
          console.log('discoverReaders error:', discErr);
          throw new Error(discErr?.message || 'discoverReaders failed');
        }

        const readers = latestReadersRef.current || [];
        console.log('✅ discovered tapToPay readers:', readers);

        const chosen = FORCE_SIMULATED_READER
          ? readers[0]
          : readers.find(r => !r?.simulated) || readers[0];

        if (!chosen) {
          Alert.alert('No reader found');
          publishReaderStatus({connected: false, label: ''});
          return;
        }

        if (!FORCE_SIMULATED_READER && chosen?.simulated) {
          Alert.alert(
            'Still simulated',
            'SDK returned only simulated readers. Check device eligibility and Stripe config.',
          );
          return;
        }

        const locationIdToUse = FORCE_SIMULATED_READER
          ? chosen.locationId
          : LIVE_LOCATION_ID;

        setStatusLine('Connecting Tap to Pay…');

        const {error: connErr} = await connectReader(
          {reader: chosen, locationId: locationIdToUse},
          'tapToPay',
        );

        if (connErr) {
          console.log('connectReader error:', connErr);
          throw new Error(connErr?.message || 'connectReader failed');
        }

        if (FORCE_SIMULATED_READER && typeof setSimulatedCard === 'function') {
          await setSimulatedCard({number: '4242424242424242', type: 'credit'});
        }

        setStatusLine('Reader connected');
        publishReaderStatus({
          connected: true,
          label:
            chosen?.label || chosen?.serialNumber || 'Tap to Pay Connected',
        });
      } catch (e) {
        console.log('connectReaderFlow error:', e);
        setStatusLine(`Connect failed: ${String(e?.message || e)}`);
        publishReaderStatus({connected: false, label: ''});
        Alert.alert('Connect Failed', String(e?.message || e));
      } finally {
        try {
          await cancelDiscovering();
        } catch {}
      }
    }, [
      cancelDiscovering,
      connectReader,
      discoverReaders,
      ensureInit,
      publishReaderStatus,
      setSimulatedCard,
    ]);

    const disconnectReaderFlow = useCallback(async () => {
      try {
        await disconnectReader();
        setStatusLine('Reader disconnected');
        publishReaderStatus({connected: false, label: ''});
      } catch (e) {
        console.log('disconnectReaderFlow error:', e);
        Alert.alert('Disconnect failed', String(e?.message || e));
      }
    }, [disconnectReader, publishReaderStatus]);

    const startCardPayment = useCallback(async () => {
      try {
        await ensureInit();

        if (!connectedReader) {
          Alert.alert('Reader not connected', 'Connect Tap to Pay first.');
          return;
        }

        const amt = Number(amountCents || 0);
        if (!amt || amt < 1) {
          Alert.alert('Invalid amount', 'Amount must be at least $0.01');
          return;
        }

        setStatusLine('Creating PaymentIntent…');

        const selection = await readAgpaySelection();

        const meta = {
          ...(debugMeta || {}),
          corporateRef: selection?.corporateRef || '',
          corporateName: selection?.corporateName || '',
          storeRef: selection?.storeRef || '',
          storeName: selection?.storeName || '',
        };

        const {clientSecret, raw} = await createIntentOnBackend({
          amountCents: amt,
          currency,
          metadata: meta,
        });

        setStatusLine('Retrieving intent…');
        const retrieved = await retrievePaymentIntent(clientSecret);
        if (retrieved?.error) {
          throw new Error(retrieved.error?.message || 'Retrieve intent failed');
        }

        setStatusLine('Collecting payment method…');
        const collected = await collectPaymentMethod({
          paymentIntent: retrieved?.paymentIntent,
        });
        if (collected?.error) {
          throw new Error(
            collected.error?.message || 'Collect payment method failed',
          );
        }

        setStatusLine('Confirming…');
        const confirmed = await confirmPaymentIntent({
          paymentIntent: collected?.paymentIntent,
        });
        if (confirmed?.error) {
          throw new Error(confirmed.error?.message || 'Confirm payment failed');
        }

        const pi = confirmed?.paymentIntent || {};
        setStatusLine('Payment succeeded');

        onPaymentSuccess?.({
          method: 'CARD',
          paymentMethod: 'CARD',
          amountCents: amt,
          amountText: amountLabel || `$${(amt / 100).toFixed(2)}`,
          currency: currency || 'usd',
          totalCents: amt,
          grandTotalCents: amt,
          breakdown: breakdown || null,
          stripe: {
            paymentIntentId: pi?.id || null,
            status: pi?.status || null,
            amount: pi?.amount || amt,
            currency: pi?.currency || currency,
          },
          stripeReturnedObject: JSON.stringify(raw || {}),
          createdAtText: new Date().toLocaleString(),
        });
      } catch (e) {
        console.log('startCardPayment error:', e);
        setStatusLine(`Payment failed: ${String(e?.message || e)}`);
        Alert.alert('Payment failed', String(e?.message || e));
      }
    }, [
      amountCents,
      amountLabel,
      breakdown,
      collectPaymentMethod,
      confirmPaymentIntent,
      connectedReader,
      currency,
      debugMeta,
      ensureInit,
      onPaymentSuccess,
      retrievePaymentIntent,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        ensureInit,
        connectReaderFlow,
        disconnectReaderFlow,
        startCardPayment,
        isReaderConnected: () => !!connectedReader,
        getStatusLine: () => statusLine,
      }),
      [
        connectReaderFlow,
        disconnectReaderFlow,
        ensureInit,
        startCardPayment,
        connectedReader,
        statusLine,
      ],
    );

    useEffect(() => {
      if (connectedReader) {
        publishReaderStatus({
          connected: true,
          label:
            connectedReader?.label ||
            connectedReader?.serialNumber ||
            'Tap to Pay Connected',
        });
      } else {
        publishReaderStatus({connected: false, label: ''});
      }
    }, [connectedReader, publishReaderStatus]);

    // ✅ IMPORTANT: render nothing (no duplicated UI / no debug footer)
    return null;
  },
);

export default PaymentTerminal;
