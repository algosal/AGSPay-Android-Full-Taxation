// FILE: App.js
//
// ✅ CHANGE: Connect Stripe Tap to Pay automatically right after login
// Fixes: "🔥 Warmup: paymentRef not ready yet" by mounting PaymentTerminal whenever logged in.

import React, {useEffect, useMemo, useRef, useState, useCallback} from 'react';
import {
  Alert,
  SafeAreaView,
  StatusBar,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {StripeTerminalProvider} from '@stripe/stripe-terminal-react-native';
import * as Keychain from 'react-native-keychain';

// ✅ KEEP AWAKE (prevents screen from sleeping)
import KeepAwake from 'react-native-keep-awake';

import Login from './components/Login/Login';
import CorporateSelectScreen from './components/CorporateSelect/CorporateSelectScreen';
import StoreSelectScreen from './components/StoreSelect/StoreSelectScreen';

import TerminalScreen from './components/Terminal/TerminalScreen';
import AmountEntryScreen from './components/Terminal/AmountEntryScreen';
import TipScreen from './components/Tip/TipScreen';
import CheckoutScreen from './components/Checkout/CheckoutScreen';
import ReceiptScreen from './components/Receipt/ReceiptScreen';
import FixedTipScreen from './components/Tip/FixedTipScreen';

import StoreSalesScreen from './components/Sales/StoreSalesScreen';

import PaymentTerminal from './components/PaymentTerminal';
import {themes} from './components/theme/agTheme';

const CONNECTION_TOKEN_URL =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/connection_token';

const VERIFY_ME_URL =
  'https://omrb8dwy0j.execute-api.us-east-2.amazonaws.com/prod/VerifyMe';

const TAX_RATE = 0.0885;

// ✅ If true: connect right after login (will request location permission on Android)
const AUTO_CONNECT_READER_ON_LOGIN = true;

// ---------------------- Android BLE permissions (Stripe Terminal) ----------------------
//
// ✅ On Android 12+, Bluetooth scan/connect requires runtime perms.
// ✅ BLE discovery also depends on Location permission AND device Location Services toggle.
async function ensureAndroidBlePermissions() {
  if (Platform.OS !== 'android') return true;

  try {
    const perms = [];

    // Android 12+ (API 31+) runtime permissions
    if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN) {
      perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    }
    if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) {
      perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    }

    // Location permission required for BLE scan on Android
    perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);

    const results = await PermissionsAndroid.requestMultiple(perms);

    const scanOk =
      !PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN ||
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted';

    const connectOk =
      !PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT ||
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted';

    const locOk =
      results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
      'granted';

    const ok = scanOk && connectOk && locOk;

    if (!ok) {
      console.log('❌ BLE permissions denied:', results);
    } else {
      console.log('✅ BLE permissions granted:', results);
    }

    return ok;
  } catch (e) {
    console.log('ensureAndroidBlePermissions error:', e);
    return false;
  }
}

function safeJsonParse(x) {
  try {
    return JSON.parse(String(x || '').trim());
  } catch {
    return null;
  }
}

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function calcServiceFeeCents(baseCents) {
  const base = Math.max(0, Number(baseCents || 0));
  const percentPart = Math.round(base * 0.027);
  const fixedPart = 5;

  const capped = Math.min(base, 10000);
  const extra = 5 + Math.round((capped / 10000) * 45);

  const fee = percentPart + fixedPart + extra;
  return Math.max(5, fee);
}

// ---------------------- Keychain helpers ----------------------

async function readAgpayAuthToken() {
  try {
    const tokenCreds = await Keychain.getGenericPassword({
      service: 'agpayAuthToken',
    });
    if (tokenCreds?.password && typeof tokenCreds.password === 'string') {
      return tokenCreds.password;
    }

    const internet = await Keychain.getInternetCredentials('agpayAuth');
    if (internet?.password) {
      const session = JSON.parse(internet.password);
      if (session?.token) return session.token;
    }

    return null;
  } catch (e) {
    console.log('readAgpayAuthToken error:', e);
    return null;
  }
}

async function readAgpaySession() {
  try {
    const sessCreds = await Keychain.getGenericPassword({
      service: 'agpaySession',
    });
    if (sessCreds?.password) return JSON.parse(sessCreds.password);

    const internet = await Keychain.getInternetCredentials('agpayAuth');
    if (internet?.password) return JSON.parse(internet.password);

    return null;
  } catch (e) {
    console.log('readAgpaySession error:', e);
    return null;
  }
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

async function clearAgpayComment() {
  try {
    await Keychain.setInternetCredentials('agpayComment', 'comment', ' ');
    return true;
  } catch (e) {
    console.log('clearAgpayComment error:', e);
    return false;
  }
}

// ✅ Warmup flag
async function readWarmupFlag() {
  try {
    const warm = await Keychain.getGenericPassword({
      service: 'agpayWarmupTerminal',
    });
    return warm?.password === '1';
  } catch {
    return false;
  }
}

async function clearWarmupFlag() {
  try {
    await Keychain.resetGenericPassword({service: 'agpayWarmupTerminal'});
  } catch {}
}

// ---------------------- VerifyMe (pk only) ----------------------

function normalizeUserPk(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('USER#')) return s;
  return `USER#${s}`;
}

async function readUserPkFromKeychain() {
  try {
    const sess = await readAgpaySession();
    const raw =
      sess?.pk ||
      sess?.ownerId ||
      sess?.userPk ||
      sess?.userId ||
      sess?.uuid ||
      null;

    if (raw) return normalizeUserPk(raw);

    const internet = await Keychain.getInternetCredentials('agpayAuth');
    if (internet?.password) {
      try {
        const parsed = JSON.parse(internet.password);
        const raw2 =
          parsed?.pk ||
          parsed?.ownerId ||
          parsed?.userPk ||
          parsed?.userId ||
          parsed?.uuid ||
          null;
        if (raw2) return normalizeUserPk(raw2);
      } catch {}
    }

    return '';
  } catch (e) {
    console.log('readUserPkFromKeychain error:', e);
    return '';
  }
}

async function verifyUserRoleByPk(pk) {
  const safePk = normalizeUserPk(pk);
  if (!safePk) throw new Error('Missing pk for VerifyMe');

  let resp;
  let text = '';

  try {
    resp = await fetch(VERIFY_ME_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({pk: safePk}),
    });
    text = await resp.text();
  } catch (e) {
    console.log('VerifyMe POST fetch error:', e);
  }

  if (!resp || !resp.ok) {
    try {
      const url = `${VERIFY_ME_URL}?pk=${encodeURIComponent(safePk)}`;
      const r2 = await fetch(url, {method: 'GET'});
      const t2 = await r2.text();
      resp = r2;
      text = t2;
    } catch (e) {
      console.log('VerifyMe GET fetch error:', e);
    }
  }

  if (!resp || !resp.ok) {
    throw new Error(`VerifyMe failed. HTTP ${resp?.status || 'NO_RESP'}`);
  }

  let outer = safeJsonParse(text);
  if (!outer) outer = null;

  let data = outer;
  if (outer && typeof outer.body === 'string') {
    const inner = safeJsonParse(outer.body);
    data = inner || outer;
  }

  const role =
    data?.user_role || data?.userRole || data?.role || data?.account_role || '';

  return {pk: data?.pk || safePk, user_role: String(role || '').trim()};
}

export default function App() {
  // ✅ KEEP AWAKE (prevents screen from sleeping while app is open)
  useEffect(() => {
    try {
      KeepAwake.activate();
    } catch (e) {
      console.log('KeepAwake.activate error:', e);
    }
    return () => {
      try {
        KeepAwake.deactivate();
      } catch {}
    };
  }, []);

  const paymentRef = useRef(null);
  const startingCardRef = useRef(false);
  const warmupRanRef = useRef(false);

  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState('LOGIN');
  const [session, setSession] = useState(null);

  const [chargeData, setChargeData] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const [readerStatus, setReaderStatus] = useState({
    connected: false,
    label: '',
  });
  const [isReaderBusy, setIsReaderBusy] = useState(false);

  const [terminalStatusLine, setTerminalStatusLine] = useState('');
  const [stripeEnabled, setStripeEnabled] = useState(false);

  const [themeMode, setThemeMode] = useState('dark');
  const theme = useMemo(() => themes[themeMode] || themes.dark, [themeMode]);
  const toggleTheme = () =>
    setThemeMode(m => (m === 'dark' ? 'light' : 'dark'));

  function go(next) {
    console.log('🧭 NAV =>', next);
    setScreen(next);
  }

  const hardLogoutToLogin = () => {
    setSession(null);
    setChargeData(null);
    setReceipt(null);
    setStripeEnabled(false);
    setReaderStatus({connected: false, label: ''});
    setIsReaderBusy(false);
    setTerminalStatusLine('');
    warmupRanRef.current = false;
    clearWarmupFlag();
    setScreen('LOGIN');
  };

  async function gateVerifyOrLogout(where = 'unknown') {
    try {
      const pk = await readUserPkFromKeychain();
      if (!pk) return {ok: true, skipped: true};

      const res = await verifyUserRoleByPk(pk);

      if (String(res?.user_role || '').toLowerCase() === 'banned') {
        Alert.alert(
          'Access blocked',
          'This account is banned. Please contact support.',
        );
        hardLogoutToLogin();
        return {ok: false, banned: true};
      }

      return {ok: true, role: res?.user_role || ''};
    } catch (e) {
      return {ok: true, error: String(e?.message || e)};
    }
  }

  const tokenProvider = useCallback(async () => {
    const resp = await fetch(CONNECTION_TOKEN_URL, {method: 'POST'});
    const text = await resp.text();

    if (!resp.ok) throw new Error(`Connection token HTTP ${resp.status}`);

    let outer = safeJsonParse(text);
    if (!outer) outer = {};

    let data = outer;
    if (outer?.body && typeof outer.body === 'string') {
      const inner = safeJsonParse(outer.body);
      if (inner) data = inner;
    } else if (outer?.body && typeof outer.body === 'object') {
      data = outer.body;
    }

    const secret = data?.secret;
    if (!secret || typeof secret !== 'string') {
      throw new Error(`Missing connection token secret. raw=${text}`);
    }

    return secret;
  }, []);

  // ✅ BOOT
  useEffect(() => {
    (async () => {
      try {
        const token = await readAgpayAuthToken();
        const sel = await readAgpaySelection();
        const sess = await readAgpaySession();

        if (token) await clearAgpayComment();
        if (sess?.token) setSession({token: sess.token});

        if (token) {
          const gate = await gateVerifyOrLogout('BOOT');
          if (!gate.ok) {
            setBooting(false);
            return;
          }
        }

        if (token && sel?.storeRef) setScreen('TERMINAL');
        else if (token && (sel?.corporateId || sel?.corporateRef))
          setScreen('STORE');
        else if (token) setScreen('CORP');
        else setScreen('LOGIN');
      } catch (e) {
        setScreen('LOGIN');
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  async function waitForPaymentRefReady(timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (
        paymentRef.current?.ensureInit &&
        paymentRef.current?.connectReaderFlow
      ) {
        return true;
      }
      await new Promise(r => setTimeout(r, 120));
    }
    return false;
  }

  // ✅ Warmup+Connect immediately after login (not waiting for TERMINAL)
  useEffect(() => {
    (async () => {
      try {
        if (!session?.token) return;
        if (warmupRanRef.current) return;

        const shouldWarmup = await readWarmupFlag();
        if (!shouldWarmup) return;

        console.log('🔥 Warmup requested (post-login)');

        // Ensure PaymentTerminal is mounted and ref is ready
        const ready = await waitForPaymentRefReady(8000);
        if (!ready) {
          console.log('🔥 Warmup: paymentRef still not ready');
          return;
        }

        warmupRanRef.current = true;
        await clearWarmupFlag();

        setStripeEnabled(true);

        console.log('🔥 Warmup => ensureInit()');
        await paymentRef.current.ensureInit?.();

        if (AUTO_CONNECT_READER_ON_LOGIN) {
          // ✅ Ensure permissions before connecting
          setTerminalStatusLine('Requesting Bluetooth permissions…');
          const ok = await ensureAndroidBlePermissions();
          if (!ok) {
            Alert.alert(
              'Permissions needed',
              'Enable Nearby devices (Bluetooth) + Location permissions. Also make sure Location is ON in device settings.',
            );
            setTerminalStatusLine('');
            return;
          }

          console.log('🔌 Warmup => connectReaderFlow()');
          setIsReaderBusy(true);
          try {
            setTerminalStatusLine('Searching for reader…');
            await paymentRef.current.connectReaderFlow?.();
          } finally {
            setIsReaderBusy(false);
            setTerminalStatusLine('');
          }
        }

        console.log('✅ Warmup complete');
      } catch (e) {
        console.log('❌ Warmup error:', e);
        setTerminalStatusLine('');
      }
    })();
  }, [session?.token]);

  // ---------- LOGIN ----------
  const handleLoginSuccess = async payload => {
    const token = payload?.token;
    if (!token) return Alert.alert('Login failed');

    setSession({token});
    const gate = await gateVerifyOrLogout('LOGIN');
    if (!gate.ok) return;

    go('CORP');
  };

  const handleAmountDone = payload => {
    const amountCentsRaw = payload?.amountCents;
    const amountDollarsRaw =
      payload?.amountDollars !== undefined
        ? payload.amountDollars
        : payload?.amount;

    let subtotalCents = 0;

    if (Number.isFinite(Number(amountCentsRaw)) && Number(amountCentsRaw) > 0) {
      subtotalCents = Math.round(Number(amountCentsRaw));
    } else if (
      Number.isFinite(Number(amountDollarsRaw)) &&
      Number(amountDollarsRaw) > 0
    ) {
      subtotalCents = Math.round(Number(amountDollarsRaw) * 100);
    }

    const taxCents = Math.round(subtotalCents * TAX_RATE);
    const baseBeforeTipCents = subtotalCents + taxCents;

    const albaFeeCents = calcServiceFeeCents(baseBeforeTipCents);
    const totalCents = baseBeforeTipCents + albaFeeCents;

    setChargeData({
      method: 'CARD',
      currency: 'usd',
      subtotalCents,
      taxCents,
      albaFeeCents,
      tipCents: 0,
      totalCents,
      totalLabel: centsToMoney(totalCents),
    });

    go('FIXED_TIP');
  };

  const handleTipDone = ({tipCents}) => {
    const prev = chargeData || {
      subtotalCents: 0,
      taxCents: 0,
      albaFeeCents: 0,
      tipCents: 0,
      currency: 'usd',
      method: 'CARD',
    };

    const subtotal = Number(prev.subtotalCents || 0);
    const tax = Number(prev.taxCents || 0);
    const tip = Math.max(0, Math.round(Number(tipCents || 0)));

    const baseCents = subtotal + tax + tip;
    const albaFeeCents = calcServiceFeeCents(baseCents);
    const totalCents = baseCents + albaFeeCents;

    setChargeData({
      ...prev,
      method: 'CARD',
      tipCents: tip,
      albaFeeCents,
      totalCents,
      totalLabel: centsToMoney(totalCents),
    });

    go('CHECKOUT');
  };

  const handleCashReceipt = data => {
    setReceipt({
      ...(data || {}),
      method: 'CASH',
      paymentMethod: 'CASH',
      createdAtText: new Date().toLocaleString(),
      breakdown: chargeData || null,
    });
    go('RECEIPT');
  };

  // ✅ NEW: Cancel Transaction handler (used by CheckoutScreen)
  const handleCancelTransaction = () => {
    // Discard amount/tip and return to Terminal
    setReceipt(null);
    setChargeData(null);
    setStripeEnabled(false);
    setIsReaderBusy(false);
    setTerminalStatusLine('');
    go('TERMINAL');
  };

  const startCardFlowNow = async () => {
    if (startingCardRef.current) return;
    startingCardRef.current = true;

    try {
      const gate = await gateVerifyOrLogout('PRE_CARD');
      if (!gate.ok) return;

      setStripeEnabled(true);
      setIsReaderBusy(true);

      const ready = await waitForPaymentRefReady();
      if (!ready) {
        Alert.alert('Preparing reader', 'Please wait a moment and try again.');
        return;
      }

      await paymentRef.current.ensureInit?.();

      // ✅ Ensure permissions before connecting
      setTerminalStatusLine('Requesting Bluetooth permissions…');
      const ok = await ensureAndroidBlePermissions();
      if (!ok) {
        Alert.alert(
          'Permissions needed',
          'Enable Nearby devices (Bluetooth) + Location permissions. Also make sure Location is ON in device settings.',
        );
        setTerminalStatusLine('');
        return;
      }

      const isConnected = await paymentRef.current.isReaderConnected?.();
      if (!isConnected) {
        setTerminalStatusLine('Searching for reader…');
        await paymentRef.current.connectReaderFlow?.();
      }

      setTerminalStatusLine('');
      await paymentRef.current.startCardPayment?.();
    } catch (e) {
      setTerminalStatusLine('');
      Alert.alert('Payment failed', String(e?.message || e));
    } finally {
      setIsReaderBusy(false);
      startingCardRef.current = false;
    }
  };

  const handleCardConfirm = async data => {
    setChargeData(data);
    go('TERMINAL');
    setTimeout(startCardFlowNow, 0);
  };

  const handlePaymentSuccess = async receiptPayload => {
    setReceipt(receiptPayload);
    setStripeEnabled(false);
    setIsReaderBusy(false);
    go('RECEIPT');
  };

  // ---------- UI ----------
  if (booting) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.bg,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}>
        <StatusBar translucent backgroundColor="transparent" />
        <ActivityIndicator size="large" />
        <Text style={{marginTop: 12, color: theme.muted}}>Starting AGPay…</Text>
      </SafeAreaView>
    );
  }

  const content = (() => {
    if (screen === 'LOGIN')
      return <Login theme={theme} onLoginSuccess={handleLoginSuccess} />;

    if (screen === 'CORP')
      return (
        <CorporateSelectScreen
          theme={theme}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
          onLogout={hardLogoutToLogin}
          onCorporatePicked={() => go('STORE')}
        />
      );

    if (screen === 'STORE')
      return (
        <StoreSelectScreen
          theme={theme}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
          onBack={() => go('CORP')}
          onLogout={hardLogoutToLogin}
          onStorePicked={() => go('TERMINAL')}
        />
      );

    if (screen === 'TERMINAL')
      return (
        <TerminalScreen
          theme={theme}
          onBackToStoreSelect={() => go('STORE')}
          onGoToTip={() => go('AMOUNT')}
          onGoToSales={() => go('SALES')}
          readerStatus={readerStatus}
          isReaderBusy={isReaderBusy}
          chargeData={chargeData}
          terminalStatusLine={terminalStatusLine}
          onConnectReader={async () => {
            const gate = await gateVerifyOrLogout('PRE_CONNECT_READER');
            if (!gate.ok) return;

            // ✅ Ensure permissions before connecting
            setTerminalStatusLine('Requesting Bluetooth permissions…');
            const ok = await ensureAndroidBlePermissions();
            if (!ok) {
              Alert.alert(
                'Permissions needed',
                'Enable Nearby devices (Bluetooth) + Location permissions. Also make sure Location is ON in device settings.',
              );
              setTerminalStatusLine('');
              return;
            }

            setStripeEnabled(true);

            const ready = await waitForPaymentRefReady();
            if (!ready) {
              Alert.alert('Preparing reader', 'Please try again in a moment.');
              setTerminalStatusLine('');
              return;
            }

            setIsReaderBusy(true);
            try {
              setTerminalStatusLine('Searching for reader…');
              await paymentRef.current.ensureInit?.();
              await paymentRef.current.connectReaderFlow?.();
            } finally {
              setIsReaderBusy(false);
              setTerminalStatusLine('');
            }
          }}
          onDisconnectReader={async () => {
            const ready = await waitForPaymentRefReady(1500);
            if (!ready) return;

            setIsReaderBusy(true);
            try {
              setTerminalStatusLine('Disconnecting…');
              await paymentRef.current.disconnectReaderFlow?.();
            } finally {
              setIsReaderBusy(false);
              setTerminalStatusLine('');
            }
          }}
        />
      );

    if (screen === 'SALES')
      return (
        <StoreSalesScreen
          theme={theme}
          onBack={() => go('TERMINAL')}
          onLogout={hardLogoutToLogin}
        />
      );

    if (screen === 'FIXED_TIP')
      return (
        <FixedTipScreen
          theme={theme}
          chargeData={chargeData}
          onBack={() => go('AMOUNT')}
          onOther={() => go('TIP')}
          onDone={handleTipDone}
        />
      );

    if (screen === 'AMOUNT')
      return (
        <AmountEntryScreen
          theme={theme}
          onBack={() => go('TERMINAL')}
          onDone={handleAmountDone}
        />
      );

    if (screen === 'TIP')
      return (
        <TipScreen
          theme={theme}
          onBack={() => go('AMOUNT')}
          onDone={handleTipDone}
        />
      );

    if (screen === 'CHECKOUT')
      return (
        <CheckoutScreen
          theme={theme}
          chargeData={chargeData}
          onBack={() => go('TIP')}
          onCancel={handleCancelTransaction} // ✅ FIX: wire Cancel Transaction
          onCashConfirm={handleCashReceipt}
          onCardConfirm={handleCardConfirm}
          isBusy={isReaderBusy}
        />
      );

    if (screen === 'RECEIPT')
      return (
        <ReceiptScreen
          theme={theme}
          receipt={receipt}
          onBack={() => go('CHECKOUT')}
          onResetTxn={() => {
            setReceipt(null);
            setChargeData(null);
            setStripeEnabled(false);
            setIsReaderBusy(false);
            setTerminalStatusLine('');
          }}
          onDone={() => go('TERMINAL')}
        />
      );

    return <View />;
  })();

  const showFloatingToggle = screen !== 'CORP' && screen !== 'STORE';

  // ✅ Provider should stay mounted. Do NOT key-toggle it.
  return (
    <StripeTerminalProvider tokenProvider={tokenProvider} logLevel="verbose">
      <SafeAreaView style={{flex: 1, backgroundColor: theme.bg, paddingTop: 0}}>
        <StatusBar translucent backgroundColor="transparent" />

        {showFloatingToggle ? (
          <TouchableOpacity
            onPress={toggleTheme}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 9999,
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.card,
              opacity: 0.95,
            }}>
            <Text style={{color: theme.text, fontWeight: '900'}}>
              {themeMode === 'dark' ? '☀️' : '🌙'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {content}

        {/* ✅ IMPORTANT: Always mount PaymentTerminal when logged in so ref is always ready */}
        {!!session?.token ? (
          <PaymentTerminal
            ref={paymentRef}
            amountCents={Number(chargeData?.totalCents || 0)}
            currency={chargeData?.currency || 'usd'}
            amountLabel={chargeData?.totalLabel || null}
            breakdown={chargeData || null}
            onReaderStatusChange={setReaderStatus}
            onPaymentSuccess={handlePaymentSuccess}
            onTerminalStatusLine={setTerminalStatusLine}
          />
        ) : null}
      </SafeAreaView>
    </StripeTerminalProvider>
  );
}
