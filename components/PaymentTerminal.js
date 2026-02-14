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

// ✅ THIS is your transactions endpoint (POST)
const VENDIO_TXN_URL =
  'https://kvscjsddkd.execute-api.us-east-2.amazonaws.com/prod/VendioTransactions';

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

// ✅ Improved: reads from BOTH stores (generic token store first, then internet session)
async function readAgpayAuthToken() {
  try {
    // 1) Preferred: generic token store (written by Login.js)
    const tokenCreds = await Keychain.getGenericPassword({
      service: 'agpayAuthToken',
    });
    if (tokenCreds?.password && typeof tokenCreds.password === 'string') {
      return tokenCreds.password;
    }

    // 2) Fallback: internet session store
    const creds = await Keychain.getInternetCredentials('agpayAuth');
    if (!creds?.password) return null;
    const parsed = JSON.parse(creds.password);
    return parsed?.token || null;
  } catch (e) {
    console.log('readAgpayAuthToken error:', e);
    return null;
  }
}

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

async function clearAgpayComment() {
  try {
    await Keychain.setInternetCredentials('agpayComment', 'comment', ' ');
    return true;
  } catch (e) {
    console.log('clearAgpayComment error:', e);
    return false;
  }
}

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

function buildStripeDescription({
  corporateName,
  storeName,
  comment,
  amountLabel,
}) {
  const corp = String(corporateName || '').trim();
  const store = String(storeName || '').trim();
  const cmt = String(comment || '').trim();
  const amt = String(amountLabel || '').trim();

  const parts = [];
  if (corp || store)
    parts.push(`${corp || 'Corporate'} / ${store || 'Store'}`.trim());
  if (amt) parts.push(amt);
  if (cmt) parts.push(cmt);

  return parts.join(' · ').slice(0, 255);
}

async function createIntentOnBackend({
  amountCents,
  currency,
  metadata,
  description,
}) {
  const jwt = await readAgpayAuthToken();

  const payload = {
    amount: Number(amountCents || 0),
    currency: String(currency || 'usd'),
    metadata: metadata || {},
    ...(description ? {description: String(description)} : {}),
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
      `Missing client_secret. outer=${JSON.stringify(
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

async function readStoreFromKeychainFallback() {
  const servicesToTry = [
    'agpayStore',
    'agpaySelectedStore',
    'agpayStoreSelection',
    'agpayPickedStore',
    'agpayStorePicked',
    'selectedStore',
    'storeSelection',
    'store',
  ];

  for (const svc of servicesToTry) {
    try {
      const creds = await Keychain.getInternetCredentials(svc);
      if (!creds?.password) continue;
      const raw = String(creds.password || '').trim();
      if (!raw) continue;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') continue;

      const storeName =
        obj.storeName ||
        obj?.store?.storeName ||
        obj?.selectedStore?.storeName ||
        obj?.storePicked?.storeName ||
        obj.name;

      const storeRef =
        obj.storeRef ||
        obj?.store?.storeRef ||
        obj?.selectedStore?.storeRef ||
        obj?.storePicked?.storeRef;

      if (storeName || storeRef) {
        return {
          storeName: storeName ? String(storeName).trim() : '',
          storeRef: storeRef ? String(storeRef).trim() : '',
        };
      }
    } catch {}
  }

  return {storeName: '', storeRef: ''};
}

function intOr0(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function pickCents(breakdown, debugMeta, keys) {
  const b = breakdown && typeof breakdown === 'object' ? breakdown : {};
  const d = debugMeta && typeof debugMeta === 'object' ? debugMeta : {};
  for (const k of keys) {
    if (b[k] !== undefined && b[k] !== null) return intOr0(b[k]);
    if (d[k] !== undefined && d[k] !== null) return intOr0(d[k]);
  }
  return 0;
}

async function postTransactionToVendio(txnPayload) {
  const jwt = await readAgpayAuthToken();

  console.log('🧾 VendioTransactions → POST:', VENDIO_TXN_URL, txnPayload);

  const resp = await fetch(VENDIO_TXN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? {Authorization: jwt} : {}),
    },
    body: JSON.stringify(txnPayload),
  });

  const text = await resp.text();
  console.log('🧾 VendioTransactions → HTTP:', resp.status, text);

  if (!resp.ok) {
    throw new Error(
      `VendioTransactions POST failed: HTTP ${resp.status}. Body: ${text}`,
    );
  }

  try {
    const json = JSON.parse(text);
    console.log(
      '🧾 VendioTransactions → OK (parsed): keys=',
      Object.keys(json || {}),
    );
    return json;
  } catch {
    return text;
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

    const [statusLine, setStatusLine] = useState('Not initialized');

    const latestReadersRef = useRef([]);
    const tapToPaySupportedRef = useRef(null);
    const connectedReaderRef = useRef(null);

    const terminalReadyRef = useRef(false);
    const initPromiseRef = useRef(null);
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
      if (terminalReadyRef.current) return true;
      if (initPromiseRef.current) return initPromiseRef.current;

      initPromiseRef.current = (async () => {
        console.log('Alba Terminal → initialize() start');
        console.log('📱 Platform:', Platform.OS);
        setStatusLine('Initializing Alba Gold Systems Terminal…');

        let res;
        try {
          res = await Promise.race([
            initialize(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('initialize() timed out after 12s')),
                12000,
              ),
            ),
          ]);
        } catch (e) {
          console.log('❌ initialize() timeout/error:', e);
          setStatusLine(`Init failed: ${String(e?.message || e)}`);
          throw e;
        }

        console.log('Alba Terminal → initialize() result:', res);

        if (res?.error) {
          setStatusLine(
            `Init failed: ${res.error?.message || res.error?.code}`,
          );
          throw new Error(
            res.error?.message || 'Stripe Terminal initialize failed',
          );
        }

        try {
          await setTapToPayUxConfiguration({
            tapZone: {
              tapZoneIndicator: TapZoneIndicator.BACK,
              tapZonePosition: {xBias: 0.5, yBias: 0.45},
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
          console.log('supportsReadersOfType(tapToPay):', r);
        } catch (e) {
          console.log('supportsReadersOfType error:', e);
          tapToPaySupportedRef.current = null;
        }

        terminalReadyRef.current = true;
        setStatusLine('Initialized');
        return true;
      })();

      try {
        return await initPromiseRef.current;
      } finally {
        initPromiseRef.current = null;
      }
    }, [initialize, setTapToPayUxConfiguration, supportsReadersOfType]);

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

    async function discoverWithTimeout(timeoutMs = 9000) {
      const discPromise = (async () => {
        const out = await discoverReaders({
          discoveryMethod: 'tapToPay',
          simulated: false,
        });
        return out;
      })();

      const timeoutPromise = new Promise(resolve =>
        setTimeout(() => resolve({__timeout: true}), timeoutMs),
      );

      const res = await Promise.race([discPromise, timeoutPromise]);

      if (res && res.__timeout) {
        console.log('⏱️ discoverReaders timed out — cancelDiscovering()');
        try {
          await cancelDiscovering();
        } catch {}
        throw new Error('Discover readers timed out. Try again.');
      }

      return res;
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
            'TERMINAL_LOCATION_ID must be a valid Stripe Terminal Location (tml_...).',
          );
          return false;
        }

        try {
          await cancelDiscovering();
        } catch {}

        setStatusLine('Discovering Tap to Pay…');

        console.log('🔎 discoverReaders(tapToPay) starting…');
        const disc = await discoverWithTimeout(9000);

        if (disc?.error) {
          console.log('discoverReaders error:', disc.error);
          throw new Error(disc.error?.message || 'discoverReaders failed');
        }

        const readers = await waitForReaders({timeoutMs: 6500});
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
        console.log('🟩 startCardPayment() begin');
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

        const selection = (await readAgpaySelection()) || {};
        const storeFallback = await readStoreFromKeychainFallback();

        const corporateRef = String(selection?.corporateRef || '').trim();
        const corporateName = String(selection?.corporateName || '').trim();
        const storeRef = String(
          selection?.storeRef || storeFallback?.storeRef || '',
        ).trim();
        const storeName = String(
          selection?.storeName || storeFallback?.storeName || '',
        ).trim();

        console.log('🧾 TXN selection corporateRef:', corporateRef);
        console.log('🧾 TXN selection corporateName:', corporateName);
        console.log('🧾 TXN selection storeRef:', storeRef);
        console.log('🧾 TXN selection storeName:', storeName);

        const uiCommentRaw = await readAgpayComment();
        const uiComment = String(uiCommentRaw || '').trim();

        const stripeDescription = buildStripeDescription({
          corporateName,
          storeName,
          comment: uiComment,
          amountLabel: amountLabel || `$${(amt / 100).toFixed(2)}`,
        });

        const baseMeta = {
          corporateRef,
          corporateName,
          storeRef,
          storeName,
          ...(uiComment ? {note: uiComment} : {}),
          ...(debugMeta || {}),
        };

        const meta = toStripeMetadata(baseMeta);

        const {clientSecret} = await createIntentOnBackend({
          amountCents: amt,
          currency,
          metadata: meta,
          description: stripeDescription,
        });

        setStatusLine('Retrieving intent…');
        const retrieved = await retrievePaymentIntent(clientSecret);
        if (retrieved?.error)
          throw new Error(retrieved.error?.message || 'Retrieve intent failed');

        setStatusLine('Tap card now… (back of device)');
        console.log('🟨 collectPaymentMethod(): waiting for NFC tap...');
        const collected = await collectPaymentMethod({
          paymentIntent: retrieved?.paymentIntent,
        });
        if (collected?.error)
          throw new Error(collected.error?.message || 'Collect failed');

        setStatusLine('Processing…');
        const confirmed = await confirmPaymentIntent({
          paymentIntent: collected?.paymentIntent,
        });
        if (confirmed?.error)
          throw new Error(confirmed.error?.message || 'Confirm failed');

        const pi = confirmed?.paymentIntent || {};
        setStatusLine('Payment succeeded');

        const subtotalCents = pickCents(breakdown, debugMeta, [
          'subtotalCents',
          'subtotal',
        ]);
        const taxCents = pickCents(breakdown, debugMeta, ['taxCents', 'tax']);
        const tipCents = pickCents(breakdown, debugMeta, ['tipCents', 'tip']);
        const serviceFeeCents = pickCents(breakdown, debugMeta, [
          'serviceFeeCents',
          'albaFeeCents',
          'albaFee',
          'feeCents',
        ]);
        const totalCents = intOr0(amt);

        const txnPayload = {
          corporateRef,
          corporateName,
          storeRef,
          storeName,

          subtotalCents,
          taxCents,
          tipCents,
          serviceFeeCents,
          albaFeeCents: serviceFeeCents,
          totalCents,

          amountLabel: amountLabel || `$${(amt / 100).toFixed(2)}`,

          debugMeta: {
            ...(debugMeta || {}),
            subtotalCents,
            taxCents,
            tipCents,
            serviceFeeCents,
            ...(debugMeta?.taxRate !== undefined
              ? {taxRate: debugMeta.taxRate}
              : {}),
            ...(uiComment ? {note: uiComment} : {}),
          },

          breakdown: breakdown || null,

          descriptionSentToStripe: stripeDescription,
          metadataSentToStripe: meta,

          stripe: {
            paymentIntentId: pi?.id || null,
            status: pi?.status || null,
            amount: pi?.amount || amt,
            currency: pi?.currency || currency || 'usd',
            paymentMethodId: pi?.paymentMethodId || pi?.paymentMethod || null,
            chargeId: null,
          },

          stripeReturnedObject: JSON.stringify(pi || {}),
          clientEpochMs: Date.now(),
        };

        try {
          const charges = Array.isArray(pi?.charges) ? pi.charges : [];
          const ch = charges[0] || null;
          if (ch?.id) txnPayload.stripe.chargeId = ch.id;

          const pmDetails = ch?.paymentMethodDetails || {};
          const cp = pmDetails?.cardPresentDetails || {};
          const cardPresent = pmDetails?.cardPresent || cp;
          const brand = cardPresent?.brand || cp?.brand;
          const last4 = cardPresent?.last4 || cp?.last4;

          if (brand) txnPayload.brand = String(brand);
          if (last4) txnPayload.last4 = String(last4);
        } catch {}

        try {
          setStatusLine('Saving transaction…');
          await postTransactionToVendio(txnPayload);
          console.log('✅ Transaction saved to VendioTransactions');
        } catch (e) {
          console.log('❌ Transaction save failed:', e);
          Alert.alert(
            'Saved charge, but TXN save failed',
            String(e?.message || e),
          );
        }

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
          corporateRef,
          corporateName,
          storeRef,
          storeName,
          stripe: {
            paymentIntentId: pi?.id || null,
            status: pi?.status || null,
            amount: pi?.amount || amt,
            currency: pi?.currency || currency || 'usd',
            paymentMethodId: pi?.paymentMethodId || pi?.paymentMethod || null,
          },
          stripeReturnedObject: JSON.stringify(pi || {}),
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
