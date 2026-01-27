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
import {TERMINAL_LOCATION_ID} from '../config/stripeTerminal.js';

const CREATE_INTENT_URL =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/create-intent';

const LOCATION_ID = TERMINAL_LOCATION_ID;

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

// ✅ read the comment saved from TerminalScreen (agpayComment)
async function readAgpayComment() {
  try {
    const creds = await Keychain.getInternetCredentials('agpayComment');
    if (!creds?.password) return '';
    return String(creds.password || '');
  } catch (e) {
    console.log('readAgpayComment error:', e);
    return '';
  }
}

// ✅ clear comment after transaction completes
async function clearAgpayComment() {
  try {
    await Keychain.setInternetCredentials('agpayComment', 'comment', '');
    return true;
  } catch (e) {
    console.log('clearAgpayComment error:', e);
    return false;
  }
}

// ✅ Stripe metadata values should be strings.
// Your backend also sanitizes, but we do best-effort here too.
function toStripeMetadata(obj) {
  const out = {};
  try {
    const src = obj && typeof obj === 'object' ? obj : {};
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined || v === null) continue;
      const key = String(k).trim();
      if (!key) continue;
      const val = String(v).trim();
      out[key] = val;
    }
  } catch (e) {
    console.log('toStripeMetadata error:', e);
  }
  return out;
}

/**
 * Frontend-only fix:
 * - Lambda returns: { statusCode, body: "{\"client_secret\":\"...\"}" }
 * - We parse deterministically and fail loudly if parsing is the issue.
 */
async function createIntentOnBackend({
  amountCents,
  currency,
  metadata,
  description,
}) {
  const jwt = await readAgpayAuthToken();

  // ✅ IMPORTANT: send EXACT keys your lambda expects: amount, currency, metadata, description
  const payload = {
    amount: Number(amountCents || 0),
    currency: String(currency || 'usd'),
    metadata: metadata || {},
    // only include if non-empty
    ...(description ? {description: String(description)} : {}),
  };

  console.log('💳 create-intent → POST:', CREATE_INTENT_URL, payload);

  const resp = await fetch(CREATE_INTENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? {Authorization: jwt} : {}),
    },
    body: JSON.stringify(payload), // ✅ NOT double-wrapped
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

    const latestReadersRef = useRef([]);
    const tapToPaySupportedRef = useRef(null);
    const connectedReaderRef = useRef(null);
    const connectingRef = useRef(false);

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

        if (!LOCATION_ID || !String(LOCATION_ID).startsWith('tml_')) {
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
          simulated: true,
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
          console.log('🧪 Using simulated Tap to Pay reader');
        }

        setStatusLine('Connecting Tap to Pay…');
        console.log('📍 Stripe Terminal locationId in use:', LOCATION_ID);

        const {error: connErr} = await connectReader(
          {reader: chosen, locationId: LOCATION_ID},
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

        // ✅ Read comment saved from TerminalScreen
        const uiCommentRaw = await readAgpayComment();
        const uiComment = String(uiCommentRaw || '').trim();

        // ✅ Send comment to Stripe:
        // - description (Stripe PaymentIntent.description)
        // - metadata.comment (easy visibility)
        const baseMeta = {
          corporateRef: selection?.corporateRef || '',
          corporateName: selection?.corporateName || '',
          storeRef: selection?.storeRef || '',
          storeName: selection?.storeName || '',
          ...(uiComment ? {comment: uiComment} : {}),
          // keep your other fields too (stringified)
          ...(debugMeta || {}),
        };

        const meta = toStripeMetadata(baseMeta);

        const {clientSecret, raw} = await createIntentOnBackend({
          amountCents: amt,
          currency,
          metadata: meta,
          description: uiComment || '',
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

        const jwt = await readAgpayAuthToken();

        const firstCharge =
          Array.isArray(pi?.charges) && pi.charges.length
            ? pi.charges[0]
            : null;

        const cardPresent =
          firstCharge?.paymentMethodDetails?.cardPresentDetails || null;

        const stripeObj = {
          paymentIntentId: pi?.id || null,
          status: pi?.status || null,
          amount: pi?.amount || amt,
          currency: pi?.currency || currency || 'usd',
          paymentMethodId: pi?.paymentMethodId || pi?.paymentMethod || null,
          chargeId: firstCharge?.id || null,
          brand: cardPresent?.brand || null,
          last4: cardPresent?.last4 || null,
        };

        const derivedDebugMeta = {
          subtotalInput:
            debugMeta?.subtotalInput ??
            (breakdown?.subtotalCents != null
              ? String((Number(breakdown.subtotalCents) / 100).toFixed(2))
              : ''),
          subtotalCents: Number(
            debugMeta?.subtotalCents ?? breakdown?.subtotalCents ?? 0,
          ),
          taxRate: Number(
            debugMeta?.taxRate ??
              (breakdown?.subtotalCents
                ? Number(breakdown?.taxCents || 0) /
                  Number(breakdown.subtotalCents)
                : 0),
          ),
          taxCents: Number(debugMeta?.taxCents ?? breakdown?.taxCents ?? 0),
          serviceFeeCents: Number(
            debugMeta?.serviceFeeCents ??
              breakdown?.albaFeeCents ??
              breakdown?.serviceFeeCents ??
              0,
          ),
          tipCents: Number(debugMeta?.tipCents ?? breakdown?.tipCents ?? 0),
          note: uiComment || debugMeta?.note || '',
        };

        const vendioPayload = {
          corporateRef: selection?.corporateRef || '',
          corporateName: selection?.corporateName || '',
          storeRef: selection?.storeRef || '',
          storeName: selection?.storeName || '',

          totalCents: amt,
          tipCents: Number(derivedDebugMeta?.tipCents ?? 0),

          stripe: stripeObj,
          stripeReturnedObject: JSON.stringify(pi || raw || {}),
          amountLabel: amountLabel || `$${(amt / 100).toFixed(2)}`,
          debugMeta: derivedDebugMeta,

          descriptionSentToStripe: uiComment || '',
          metadataSentToStripe: meta,
          clientEpochMs: Date.now(),
        };

        const VENDIO_TX_URL =
          'https://kvscjsddkd.execute-api.us-east-2.amazonaws.com/prod/VendioTransactions';

        console.log('TX => about to send payload:', vendioPayload);
        console.log(
          'TX => auth token:',
          jwt ? `${jwt.slice(0, 10)}…` : '(missing)',
        );

        const resp = await fetch(VENDIO_TX_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(jwt ? {Authorization: jwt} : {}),
          },
          body: JSON.stringify(vendioPayload),
        });

        const respText = await resp.text();
        console.log(
          'TX => VendioTransactions response:',
          resp.status,
          respText,
        );

        if (!resp.ok) {
          throw new Error(
            `VendioTransactions failed: HTTP ${resp.status}. Body: ${respText}`,
          );
        }

        // ✅ Clear comment for the next transaction
        await clearAgpayComment();

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
            paymentIntentId: stripeObj.paymentIntentId,
            status: stripeObj.status,
            amount: stripeObj.amount,
            currency: stripeObj.currency,
            paymentMethodId: stripeObj.paymentMethodId,
            chargeId: stripeObj.chargeId,
          },
          stripeReturnedObject: vendioPayload.stripeReturnedObject,
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
