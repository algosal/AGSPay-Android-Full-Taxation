// FILE: components/PaymentTerminal.js

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {Alert, PermissionsAndroid, Platform, AppState} from 'react-native';
import * as Keychain from 'react-native-keychain';
import {
  useStripeTerminal,
  TapZoneIndicator,
  DarkMode,
} from '@stripe/stripe-terminal-react-native';
import {TERMINAL_LOCATION_ID} from '../config/stripeTerminal.js';

const CREATE_INTENT_URL =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/create-intent';

const VENDIO_TXN_URL =
  'https://kvscjsddkd.execute-api.us-east-2.amazonaws.com/prod/VendioTransactions';

const LOCATION_ID = TERMINAL_LOCATION_ID;

function androidApiLevel() {
  const v = Number(Platform.Version);
  return Number.isFinite(v) ? v : 0;
}

function normalizeBatteryPercent(raw) {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null;

  if (raw >= 0 && raw <= 1) {
    return Math.round(raw * 100);
  }

  if (raw >= 0 && raw <= 100) {
    return Math.round(raw);
  }

  return null;
}

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

async function requestBluetoothAndLocationPermissionsIfNeeded() {
  if (Platform.OS !== 'android') return true;

  const api = androidApiLevel();

  if (api >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    const ok =
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
        PermissionsAndroid.RESULTS.GRANTED;

    if (!ok) {
      Alert.alert(
        'Permissions required',
        'Bluetooth (Scan/Connect) and Location permissions are required to discover and connect the reader.',
      );
      return false;
    }
    return true;
  }

  const loc = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location Permission',
      message:
        'AGPay uses location permission to discover Bluetooth Stripe readers.',
      buttonPositive: 'OK',
    },
  );

  if (loc !== PermissionsAndroid.RESULTS.GRANTED) {
    Alert.alert('Permission required', 'Location permission is required.');
    return false;
  }
  return true;
}

async function readAgpayAuthToken() {
  try {
    const tokenCreds = await Keychain.getGenericPassword({
      service: 'agpayAuthToken',
    });
    if (tokenCreds?.password && typeof tokenCreds.password === 'string') {
      return tokenCreds.password;
    }

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
  } catch {
    throw new Error(
      `Create intent returned non-JSON. HTTP ${resp.status}. Body: ${text}`,
    );
  }

  let data = outer;
  if (outer && typeof outer.body === 'string') {
    data = JSON.parse(String(outer.body || '').trim());
  } else if (outer && outer.body && typeof outer.body === 'object') {
    data = outer.body;
  }

  const clientSecret =
    data?.client_secret ||
    data?.clientSecret ||
    data?.payment_intent?.client_secret ||
    data?.paymentIntent?.client_secret ||
    data?.paymentIntent?.clientSecret;

  if (!clientSecret) {
    throw new Error(`Missing client_secret. outer=${JSON.stringify(outer)}`);
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
    return JSON.parse(text);
  } catch {
    return text;
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
      onTerminalStatusLine,
      paymentDeviceMode = 'reader', // 'reader' | 'nfc'
    },
    ref,
  ) => {
    const latestBatteryRef = useRef({
      batteryLevel: null,
      batteryStatus: null,
      isCharging: false,
    });

    const latestReadersRef = useRef([]);
    const tapToPaySupportedRef = useRef(null);
    const connectedReaderRef = useRef(null);
    const paymentDeviceModeRef = useRef(paymentDeviceMode);

    const terminalReadyRef = useRef(false);
    const initPromiseRef = useRef(null);
    const connectingRef = useRef(false);
    const lastDiscoverAtRef = useRef(0);

    const [statusLine, setStatusLine] = useState('Not initialized');

    const publishReaderStatus = useCallback(
      next => {
        console.log('📤 publishReaderStatus:', next);
        onReaderStatusChange?.(next);
      },
      [onReaderStatusChange],
    );

    const buildCurrentReaderStatus = useCallback(reader => {
      return {
        connected: true,
        label:
          reader?.label ||
          reader?.serialNumber ||
          (paymentDeviceModeRef.current === 'nfc'
            ? 'Tap to Pay Connected'
            : 'Stripe Reader M2'),
        serialNumber: reader?.serialNumber || null,
        id: reader?.id || null,
        batteryLevel:
          normalizeBatteryPercent(reader?.batteryLevel) ??
          latestBatteryRef.current?.batteryLevel,
        batteryStatus:
          reader?.batteryStatus ||
          latestBatteryRef.current?.batteryStatus ||
          null,
        isCharging:
          typeof reader?.isCharging === 'boolean'
            ? reader.isCharging
            : !!latestBatteryRef.current?.isCharging,
      };
    }, []);

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
        console.log('🔎 onUpdateDiscoveredReaders:', readers);
      },

      onDidUpdateBatteryLevel: battery => {
        console.log('🔋 onDidUpdateBatteryLevel RAW:', battery);

        const normalized = {
          batteryLevel: normalizeBatteryPercent(battery?.batteryLevel),
          batteryStatus: battery?.batteryStatus || null,
          isCharging: !!battery?.isCharging,
        };

        latestBatteryRef.current = normalized;

        console.log('🔋 normalized battery for UI:', normalized);

        if (connectedReaderRef.current) {
          const nextStatus = {
            connected: true,
            label:
              connectedReaderRef.current?.label ||
              connectedReaderRef.current?.serialNumber ||
              (paymentDeviceModeRef.current === 'nfc'
                ? 'Tap to Pay Connected'
                : 'Stripe Reader M2'),
            serialNumber: connectedReaderRef.current?.serialNumber || null,
            id: connectedReaderRef.current?.id || null,
            ...normalized,
          };

          console.log('📤 publishing battery status to parent:', nextStatus);
          publishReaderStatus(nextStatus);
        } else {
          console.log(
            '⚠️ battery event arrived but connectedReaderRef.current is empty',
          );
        }
      },
    });

    useEffect(() => {
      paymentDeviceModeRef.current = paymentDeviceMode;
    }, [paymentDeviceMode]);

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
      console.log('🔌 connectedReader changed:', connectedReader);

      if (connectedReader) {
        console.log('🔋 connectedReader battery snapshot:', {
          batteryLevel: connectedReader?.batteryLevel,
          batteryStatus: connectedReader?.batteryStatus,
          isCharging: connectedReader?.isCharging,
        });
      }
    }, [connectedReader]);

    const ensureInit = useCallback(async () => {
      if (terminalReadyRef.current) return true;
      if (initPromiseRef.current) return initPromiseRef.current;

      initPromiseRef.current = (async () => {
        setStatusLine('Initializing Stripe Terminal…');

        const res = await Promise.race([
          initialize(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('initialize() timed out after 12s')),
              12000,
            ),
          ),
        ]);

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

    async function waitForReaders({timeoutMs = 8000, intervalMs = 250} = {}) {
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

    async function discoverTapToPayWithTimeout(timeoutMs = 9000) {
      const discPromise = discoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: false,
      });

      const timeoutPromise = new Promise(resolve =>
        setTimeout(() => resolve({__timeout: true}), timeoutMs),
      );

      const res = await Promise.race([discPromise, timeoutPromise]);

      if (res && res.__timeout) {
        try {
          await cancelDiscovering();
        } catch {}
        throw new Error('Discover Tap to Pay timed out. Try again.');
      }

      return res;
    }

    const connectBluetoothReaderFlow = useCallback(
      async (opts = {}) => {
        const silent = !!opts?.silent;

        try {
          const okPerms =
            await requestBluetoothAndLocationPermissionsIfNeeded();
          if (!okPerms) return false;

          if (!LOCATION_ID || !String(LOCATION_ID).startsWith('tml_')) {
            if (!silent) {
              Alert.alert(
                'Location ID missing',
                'TERMINAL_LOCATION_ID must be a valid Stripe Terminal Location (tml_...).',
              );
            }
            return false;
          }

          try {
            await cancelDiscovering();
          } catch {}

          latestReadersRef.current = [];
          setStatusLine('Searching for Bluetooth reader…');

          discoverReaders({
            discoveryMethod: 'bluetoothScan',
            simulated: false,
          })
            .then(res => {
              if (res?.error) {
                console.log('discoverReaders(bluetoothScan) error:', res.error);
              }
            })
            .catch(e => console.log('discoverReaders promise error:', e));

          const readers = await waitForReaders({timeoutMs: 12000});
          const chosen =
            readers.find(r => String(r?.deviceType || '') === 'stripeM2') ||
            readers.find(r => !r?.simulated) ||
            readers[0];

          if (!chosen) {
            setStatusLine('No reader found');
            publishReaderStatus({
              connected: false,
              label: '',
              batteryLevel: null,
              batteryStatus: null,
              isCharging: false,
            });
            if (!silent) {
              Alert.alert(
                'No reader found',
                '1) Make sure the M2 is powered on\n2) Make sure you did NOT pair it in Android Bluetooth settings\n3) Bring it close and try again.',
              );
            }
            return false;
          }

          try {
            await cancelDiscovering();
          } catch {}

          setStatusLine('Connecting to reader…');

          const {reader, error} = await connectReader(
            {reader: chosen, locationId: LOCATION_ID},
            'bluetoothScan',
          );

          if (error) {
            throw new Error(error?.message || 'connectReader failed');
          }

          const cr =
            reader || (await waitForConnectedReader({timeoutMs: 8000}));

          connectedReaderRef.current = cr || null;
          setStatusLine('Reader connected');

          const nextStatus = {
            connected: true,
            label: cr?.label || cr?.serialNumber || 'Stripe Reader M2',
            serialNumber: cr?.serialNumber || null,
            id: cr?.id || null,
            batteryLevel:
              normalizeBatteryPercent(cr?.batteryLevel) ??
              latestBatteryRef.current?.batteryLevel,
            batteryStatus:
              cr?.batteryStatus ||
              latestBatteryRef.current?.batteryStatus ||
              null,
            isCharging:
              typeof cr?.isCharging === 'boolean'
                ? cr.isCharging
                : !!latestBatteryRef.current?.isCharging,
          };

          console.log('✅ bluetooth connect success, publishing:', nextStatus);
          publishReaderStatus(nextStatus);

          return true;
        } catch (e) {
          console.log('connectBluetoothReaderFlow error:', e);
          setStatusLine(`Connect failed: ${String(e?.message || e)}`);
          publishReaderStatus({
            connected: false,
            label: '',
            batteryLevel: null,
            batteryStatus: null,
            isCharging: false,
          });
          if (!silent) {
            Alert.alert('Connect Failed', String(e?.message || e));
          }
          return false;
        } finally {
          try {
            await cancelDiscovering();
          } catch {}
        }
      },
      [cancelDiscovering, connectReader, discoverReaders, publishReaderStatus],
    );

    const connectTapToPayFlow = useCallback(
      async (opts = {}) => {
        const silent = !!opts?.silent;

        try {
          const ok = await requestLocationPermissionIfNeeded();
          if (!ok) return false;

          const supported = tapToPaySupportedRef.current;
          if (supported === false) {
            if (!silent) {
              Alert.alert(
                'Not supported',
                'This device does not support Tap to Pay.',
              );
            }
            return false;
          }

          if (!LOCATION_ID || !String(LOCATION_ID).startsWith('tml_')) {
            if (!silent) {
              Alert.alert(
                'Location ID missing',
                'TERMINAL_LOCATION_ID must be a valid Stripe Terminal Location (tml_...).',
              );
            }
            return false;
          }

          const now = Date.now();
          const since = now - (lastDiscoverAtRef.current || 0);
          const cooldownMs = 15000;

          try {
            await cancelDiscovering();
          } catch {}

          setStatusLine('Discovering Tap to Pay…');

          let disc;
          if (
            since < cooldownMs &&
            (latestReadersRef.current || []).length > 0
          ) {
            disc = {reused: true};
          } else {
            lastDiscoverAtRef.current = now;
            disc = await discoverTapToPayWithTimeout(9000);
          }

          if (disc?.error) {
            throw new Error(disc.error?.message || 'discoverReaders failed');
          }

          const readers = await waitForReaders({timeoutMs: 6500});
          const chosen = readers.find(r => !r?.simulated) || readers[0];

          if (!chosen) {
            setStatusLine('No reader found');
            publishReaderStatus({
              connected: false,
              label: '',
              batteryLevel: null,
              batteryStatus: null,
              isCharging: false,
            });
            if (!silent) {
              Alert.alert(
                'No reader found',
                'Move the device slightly and try again.',
              );
            }
            return false;
          }

          setStatusLine('Connecting Tap to Pay…');

          const {reader, error} = await connectReader(
            {reader: chosen, locationId: LOCATION_ID},
            'tapToPay',
          );

          if (error) {
            throw new Error(error?.message || 'connectReader failed');
          }

          const cr = reader || (await waitForConnectedReader());

          connectedReaderRef.current = cr || null;
          setStatusLine('Reader connected');
          publishReaderStatus({
            connected: true,
            label: cr?.label || cr?.serialNumber || 'Tap to Pay Connected',
            serialNumber: cr?.serialNumber || null,
            id: cr?.id || null,
            batteryLevel: null,
            batteryStatus: null,
            isCharging: false,
          });

          return true;
        } catch (e) {
          console.log('connectTapToPayFlow error:', e);
          setStatusLine(`Connect failed: ${String(e?.message || e)}`);
          publishReaderStatus({
            connected: false,
            label: '',
            batteryLevel: null,
            batteryStatus: null,
            isCharging: false,
          });
          if (!silent) {
            Alert.alert('Connect Failed', String(e?.message || e));
          }
          return false;
        } finally {
          try {
            await cancelDiscovering();
          } catch {}
        }
      },
      [cancelDiscovering, connectReader, discoverReaders, publishReaderStatus],
    );

    const connectReaderFlow = useCallback(
      async (opts = {}) => {
        if (connectingRef.current) return true;

        connectingRef.current = true;
        try {
          await ensureInit();

          const sdkReader = connectedReaderRef.current;

          if (sdkReader) {
            const nextStatus = buildCurrentReaderStatus(sdkReader);

            console.log(
              '♻️ Reader already connected, re-publishing status:',
              nextStatus,
            );
            publishReaderStatus(nextStatus);
            return true;
          }

          if (paymentDeviceModeRef.current === 'nfc') {
            return await connectTapToPayFlow(opts);
          }

          return await connectBluetoothReaderFlow(opts);
        } finally {
          connectingRef.current = false;
        }
      },
      [
        connectBluetoothReaderFlow,
        connectTapToPayFlow,
        ensureInit,
        publishReaderStatus,
        buildCurrentReaderStatus,
      ],
    );

    const disconnectReaderFlow = useCallback(async () => {
      try {
        try {
          await cancelDiscovering();
        } catch {}
        await disconnectReader();
        connectedReaderRef.current = null;
        latestBatteryRef.current = {
          batteryLevel: null,
          batteryStatus: null,
          isCharging: false,
        };
        setStatusLine('Reader disconnected');
        publishReaderStatus({
          connected: false,
          label: '',
          batteryLevel: null,
          batteryStatus: null,
          isCharging: false,
        });
      } catch (e) {
        console.log('disconnectReaderFlow error:', e);
        Alert.alert('Disconnect failed', String(e?.message || e));
      }
    }, [cancelDiscovering, disconnectReader, publishReaderStatus]);

    const refreshReaderStatusFlow = useCallback(async () => {
      if (connectingRef.current) return false;

      const status = String(statusLine || '').toLowerCase();
      const isBusyStatus =
        status.includes('creating paymentintent') ||
        status.includes('retrieving intent') ||
        status.includes('present card') ||
        status.includes('tap card now') ||
        status.includes('processing') ||
        status.includes('saving transaction');

      if (isBusyStatus) {
        Alert.alert(
          'Reader busy',
          'Please refresh only when the terminal is idle.',
        );
        return false;
      }

      if (paymentDeviceModeRef.current !== 'reader') {
        return false;
      }

      try {
        connectingRef.current = true;
        setStatusLine('Refreshing reader status…');

        try {
          await cancelDiscovering();
        } catch {}

        try {
          await disconnectReader();
        } catch (e) {
          console.log('refreshReaderStatusFlow disconnect warning:', e);
        }

        connectedReaderRef.current = null;
        latestBatteryRef.current = {
          batteryLevel: null,
          batteryStatus: null,
          isCharging: false,
        };

        publishReaderStatus({
          connected: false,
          label: '',
          batteryLevel: null,
          batteryStatus: null,
          isCharging: false,
        });

        await new Promise(r => setTimeout(r, 1000));

        const ok = await connectBluetoothReaderFlow({silent: true});
        if (!ok) {
          setStatusLine('Refresh failed');
          return false;
        }

        setStatusLine('Reader refreshed');
        return true;
      } catch (e) {
        console.log('refreshReaderStatusFlow error:', e);
        setStatusLine(`Refresh failed: ${String(e?.message || e)}`);
        Alert.alert('Refresh failed', String(e?.message || e));
        return false;
      } finally {
        connectingRef.current = false;
      }
    }, [
      statusLine,
      cancelDiscovering,
      disconnectReader,
      publishReaderStatus,
      connectBluetoothReaderFlow,
    ]);

    useEffect(() => {
      const sub = AppState.addEventListener('change', nextState => {
        if (nextState === 'active') {
          setTimeout(() => {
            connectReaderFlow({silent: true});
          }, 400);
        }
      });
      return () => sub?.remove?.();
    }, [connectReaderFlow]);

    const startCardPayment = useCallback(async () => {
      try {
        await ensureInit();

        if (!connectedReaderRef.current) {
          setStatusLine(
            paymentDeviceModeRef.current === 'nfc'
              ? 'Phone NFC not connected — connecting…'
              : 'Reader not connected — connecting…',
          );

          const ok = await connectReaderFlow({silent: true});
          if (!ok) {
            Alert.alert(
              paymentDeviceModeRef.current === 'nfc'
                ? 'Phone NFC not connected'
                : 'Reader not connected',
              'Tap CONNECT on the terminal screen, then try again.',
            );
            return;
          }
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

        setStatusLine(
          paymentDeviceModeRef.current === 'nfc'
            ? 'Tap card now… (back of device)'
            : 'Present card…',
        );

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
            ...(uiComment ? {note: uiComment} : {}),
            paymentDeviceMode: paymentDeviceModeRef.current,
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
        } catch (e) {
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
          brand: txnPayload.brand || null,
          last4: txnPayload.last4 || null,
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
        refreshReaderStatusFlow,
        startCardPayment,
        isReaderConnected: () => !!connectedReaderRef.current,
        getStatusLine: () => statusLine,
      }),
      [
        connectReaderFlow,
        disconnectReaderFlow,
        refreshReaderStatusFlow,
        ensureInit,
        startCardPayment,
        statusLine,
      ],
    );

    useEffect(() => {
      if (connectedReader) {
        const nextStatus = buildCurrentReaderStatus(connectedReader);
        console.log('🔌 connectedReader effect publishing:', nextStatus);
        publishReaderStatus(nextStatus);
      } else {
        publishReaderStatus({
          connected: false,
          label: '',
          batteryLevel: null,
          batteryStatus: null,
          isCharging: false,
        });
      }
    }, [connectedReader, publishReaderStatus, buildCurrentReaderStatus]);

    return null;
  },
);

export default PaymentTerminal;
