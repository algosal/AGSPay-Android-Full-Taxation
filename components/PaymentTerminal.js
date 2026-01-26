// FILE: components/PaymentTerminal.js
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

// ✅ LIVE Location ID (tml_...)
const LIVE_LOCATION_ID = 'tml_GUcKvwB8ozD1jO';

// ---------------------- helpers ----------------------
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

/**
 * Frontend-only fix:
 * - Lambda returns: { statusCode, body: "{\"client_secret\":\"...\"}" }
 * - We parse deterministically and fail loudly if parsing is the issue.
 */
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

  if (!resp.ok) {
    throw new Error(`Create intent failed: HTTP ${resp.status}. Body: ${text}`);
  }

  let outer;
  try {
    outer = JSON.parse(String(text || '').trim());
  } catch (e) {
    throw new Error(
      `Create intent returned non-JSON. HTTP ${resp.status}. Body: ${text}`,
    );
  }

  let data = outer;

  if (outer && typeof outer.body === 'string') {
    const bodyText = String(outer.body || '').trim();
    try {
      data = JSON.parse(bodyText);
    } catch (e) {
      throw new Error(
        `Create intent outer.body was not valid JSON. outer.body: ${outer.body}`,
      );
    }
  }

  if (outer && outer.body && typeof outer.body === 'object') {
    data = outer.body;
  }

  const clientSecret =
    data?.client_secret ||
    data?.clientSecret ||
    data?.payment_intent?.client_secret ||
    data?.paymentIntent?.client_secret ||
    data?.paymentIntent?.clientSecret;

  if (!clientSecret) {
    throw new Error(
      `Missing client_secret. HTTP ${resp.status}. outer=${JSON.stringify(
        outer,
      )} data=${JSON.stringify(data)}`,
    );
  }

  console.log(
    '✅ create-intent clientSecret length:',
    String(clientSecret).length,
  );

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

// ---------------------- component ----------------------
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
      onTerminalStatusLine,
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

    // Always-current refs to avoid stale React state timing bugs
    const latestReadersRef = useRef([]);
    const tapToPaySupportedRef = useRef(null);
    const connectedReaderRef = useRef(null);
    const connectingRef = useRef(false);

    // publish statusLine to parent (optional)
    useEffect(() => {
      onTerminalStatusLine?.(statusLine);
    }, [onTerminalStatusLine, statusLine]);

    useEffect(() => {
      if (Array.isArray(discoveredReaders)) {
        latestReadersRef.current = discoveredReaders;
      }
    }, [discoveredReaders]);

    useEffect(() => {
      connectedReaderRef.current = connectedReader || null;
    }, [connectedReader]);

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

    async function waitForReaders({timeoutMs = 6500, intervalMs = 250} = {}) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const readers = latestReadersRef.current || [];
        if (readers.length > 0) return readers;
        await new Promise(r => setTimeout(r, intervalMs));
      }
      return [];
    }

    async function waitForConnectedReader({
      timeoutMs = 5000,
      intervalMs = 150,
    } = {}) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (connectedReaderRef.current) return connectedReaderRef.current;
        await new Promise(r => setTimeout(r, intervalMs));
      }
      return null;
    }

    const connectReaderFlow = useCallback(async () => {
      if (connectingRef.current) {
        console.log('⚠️ connectReaderFlow ignored (already connecting)');
        return true;
      }

      if (connectedReaderRef.current) {
        console.log('✅ connectReaderFlow: already connected');
        setStatusLine('Reader already connected');
        publishReaderStatus({
          connected: true,
          label:
            connectedReaderRef.current?.label ||
            connectedReaderRef.current?.serialNumber ||
            'Tap to Pay Connected',
        });
        return true;
      }

      connectingRef.current = true;

      try {
        await ensureInit();

        const ok = await requestLocationPermissionIfNeeded();
        if (!ok) return false;

        const supported = tapToPaySupportedRef.current;
        if (supported === false) {
          Alert.alert(
            'Not supported',
            'This device does not support Tap to Pay.',
          );
          return false;
        }

        if (!LIVE_LOCATION_ID || !String(LIVE_LOCATION_ID).startsWith('tml_')) {
          Alert.alert(
            'Location ID missing',
            'LIVE_LOCATION_ID must be a valid Stripe Terminal Location (tml_...).',
          );
          return false;
        }

        try {
          await cancelDiscovering();
        } catch {}

        setStatusLine('Discovering Tap to Pay…');

        const {error: discErr} = await discoverReaders({
          discoveryMethod: 'tapToPay',
          simulated: false,
        });

        if (discErr) {
          console.log('discoverReaders error:', discErr);
          throw new Error(discErr?.message || 'discoverReaders failed');
        }

        const readers = await waitForReaders();
        console.log('✅ discovered tapToPay readers (waited):', readers);

        const chosen = readers.find(r => !r?.simulated) || readers[0];

        if (!chosen) {
          setStatusLine('No reader found');
          publishReaderStatus({connected: false, label: ''});
          Alert.alert(
            'No reader found',
            'Move the device slightly and try again.',
          );
          return false;
        }

        if (chosen?.simulated) {
          setStatusLine('Only simulated reader found');
          Alert.alert(
            'Reader not available',
            'Only a simulated reader was found. Confirm Tap to Pay eligibility and Stripe config.',
          );
          return false;
        }

        setStatusLine('Connecting Tap to Pay…');

        const {error: connErr} = await connectReader(
          {reader: chosen, locationId: LIVE_LOCATION_ID},
          'tapToPay',
        );

        if (connErr) {
          console.log('connectReader error:', connErr);
          throw new Error(connErr?.message || 'connectReader failed');
        }

        const cr = await waitForConnectedReader();
        if (!cr) {
          setStatusLine('Connected, but state not ready');
          publishReaderStatus({
            connected: true,
            label:
              chosen?.label || chosen?.serialNumber || 'Tap to Pay Connected',
          });
          return true;
        }

        setStatusLine('Reader connected');
        publishReaderStatus({
          connected: true,
          label: cr?.label || cr?.serialNumber || 'Tap to Pay Connected',
        });
        return true;
      } catch (e) {
        console.log('connectReaderFlow error:', e);
        setStatusLine(`Connect failed: ${String(e?.message || e)}`);
        publishReaderStatus({connected: false, label: ''});
        Alert.alert('Connect Failed', String(e?.message || e));
        return false;
      } finally {
        connectingRef.current = false;
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
    ]);

    const disconnectReaderFlow = useCallback(async () => {
      try {
        try {
          await cancelDiscovering();
        } catch {}
        await disconnectReader();
        connectedReaderRef.current = null;
        setStatusLine('Reader disconnected');
        publishReaderStatus({connected: false, label: ''});
      } catch (e) {
        console.log('disconnectReaderFlow error:', e);
        Alert.alert('Disconnect failed', String(e?.message || e));
      }
    }, [cancelDiscovering, disconnectReader, publishReaderStatus]);

    const startCardPayment = useCallback(async () => {
      try {
        await ensureInit();

        if (!connectedReaderRef.current) {
          setStatusLine('Reader not connected — connecting…');
          const ok = await connectReaderFlow();
          if (!ok) return;
          await waitForConnectedReader({timeoutMs: 5000});
        }

        if (!connectedReaderRef.current) {
          setStatusLine('Reader not ready');
          Alert.alert('Reader not ready', 'Please try again in a moment.');
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

        setStatusLine('Tap card now…');
        const collected = await collectPaymentMethod({
          paymentIntent: retrieved?.paymentIntent,
        });
        if (collected?.error) {
          throw new Error(
            collected.error?.message || 'Collect payment method failed',
          );
        }

        setStatusLine('Processing…');
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
      connectReaderFlow,
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
        isReaderConnected: () => !!connectedReaderRef.current,
        getStatusLine: () => statusLine,
      }),
      [
        connectReaderFlow,
        disconnectReaderFlow,
        ensureInit,
        startCardPayment,
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

    return null;
  },
);

export default PaymentTerminal;
