// FILE: App.js
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  SafeAreaView,
  StatusBar,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {StripeTerminalProvider} from '@stripe/stripe-terminal-react-native';
import * as Keychain from 'react-native-keychain';

import Login from './components/Login/Login';
import CorporateSelectScreen from './components/CorporateSelect/CorporateSelectScreen';
import StoreSelectScreen from './components/StoreSelect/StoreSelectScreen';

import TerminalScreen from './components/Terminal/TerminalScreen';
import AmountEntryScreen from './components/Terminal/AmountEntryScreen';
import TipScreen from './components/Tip/TipScreen';
import CheckoutScreen from './components/Checkout/CheckoutScreen';
import ReceiptScreen from './components/Receipt/ReceiptScreen';

import PaymentTerminal from './components/PaymentTerminal';
import {themes} from './components/theme/agTheme';
import FixedTipScreen from './components/Tip/FixedTipScreen';

const CONNECTION_TOKEN_URL =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/connection_token';

// ✅ Verify user role endpoint (pk only)
const VERIFY_ME_URL =
  'https://omrb8dwy0j.execute-api.us-east-2.amazonaws.com/prod/VerifyMe';

// --- Tax/Fee constants (NYC) ---
const TAX_RATE = 0.0885; // 8.85%

/**
 * ✅ StripeTerminalProvider requires:
 * tokenProvider = { fetchConnectionToken: async () => string }
 */
async function fetchConnectionToken() {
  console.log('🔥 tokenProvider CALLED (about to fetch connection token)');
  console.log('🔐 connection_token => POST:', CONNECTION_TOKEN_URL);

  const resp = await fetch(CONNECTION_TOKEN_URL, {method: 'POST'});
  const text = await resp.text();

  console.log('🔥 tokenProvider RESP:', resp.status, text);

  if (!resp.ok) throw new Error(`Connection token HTTP ${resp.status}`);

  let data = {};
  try {
    data = JSON.parse(String(text || '').trim());
  } catch {
    data = {};
  }

  // supports both {secret:"..."} and {body:"{secret:'...'}"}
  let secret = data?.secret || null;
  if (!secret && typeof data?.body === 'string') {
    try {
      secret = JSON.parse(data.body)?.secret || null;
    } catch {}
  }

  if (!secret || typeof secret !== 'string') {
    throw new Error('Missing connection token');
  }

  console.log('✅ connection token length:', secret.length);
  return secret;
}

const terminalTokenProvider = {
  fetchConnectionToken,
};

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

/**
 * Service fee rule:
 * - fee = (2.7% of base + $0.05) + extra
 * - extra ramps from $0.05 at $0 total to $0.50 at $100 total
 * - minimum enforced: at least $0.05
 */
function calcServiceFeeCents(baseCents) {
  const base = Math.max(0, Number(baseCents || 0));

  const percentPart = Math.round(base * 0.027);
  const fixedPart = 5;

  const capped = Math.min(base, 10000); // $100
  const extra = 5 + Math.round((capped / 10000) * 45); // 5..50

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

    console.log('readAgpayAuthToken: no token found');
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
    if (sessCreds?.password) {
      return JSON.parse(sessCreds.password);
    }

    const internet = await Keychain.getInternetCredentials('agpayAuth');
    if (internet?.password) {
      return JSON.parse(internet.password);
    }

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

  console.log('✅ VerifyMe => pk:', safePk);

  let resp;
  let text = '';
  try {
    resp = await fetch(VERIFY_ME_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({pk: safePk}),
    });
    text = await resp.text();
    console.log('✅ VerifyMe => HTTP:', resp.status, text);
  } catch (e) {
    console.log('VerifyMe POST fetch error:', e);
  }

  if (!resp || !resp.ok) {
    try {
      const url = `${VERIFY_ME_URL}?pk=${encodeURIComponent(safePk)}`;
      const r2 = await fetch(url, {method: 'GET'});
      const t2 = await r2.text();
      console.log('✅ VerifyMe (GET fallback) => HTTP:', r2.status, t2);
      resp = r2;
      text = t2;
    } catch (e) {
      console.log('VerifyMe GET fetch error:', e);
    }
  }

  if (!resp || !resp.ok) {
    throw new Error(`VerifyMe failed. HTTP ${resp?.status || 'NO_RESP'}`);
  }

  let outer = null;
  try {
    outer = JSON.parse(String(text || '').trim());
  } catch {
    outer = null;
  }

  let data = outer;
  if (outer && typeof outer.body === 'string') {
    try {
      data = JSON.parse(outer.body);
    } catch {
      data = outer;
    }
  }

  const role =
    data?.user_role || data?.userRole || data?.role || data?.account_role || '';

  return {
    pk: data?.pk || safePk,
    user_role: String(role || '').trim(),
    raw: data,
  };
}

export default function App() {
  const paymentRef = useRef(null);
  const startingCardRef = useRef(false);

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
    setScreen('LOGIN');
  };

  async function gateVerifyOrLogout(where = 'unknown') {
    try {
      const pk = await readUserPkFromKeychain();
      if (!pk) {
        console.log(`VerifyMe(${where}) => missing pk, skipping gate`);
        return {ok: true, skipped: true};
      }

      const res = await verifyUserRoleByPk(pk);
      console.log(`VerifyMe(${where}) => user_role:`, res?.user_role);

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
      console.log(`VerifyMe(${where}) error:`, e);
      return {ok: true, error: String(e?.message || e)};
    }
  }

  // ✅ BOOT
  useEffect(() => {
    (async () => {
      try {
        console.log('BOOT => checking saved auth + selection...');

        const token = await readAgpayAuthToken();
        const sel = await readAgpaySelection();
        const sess = await readAgpaySession();

        console.log('BOOT => token exists:', !!token);
        console.log('BOOT => selection:', sel);

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
        console.log('BOOT => error:', e);
        setScreen('LOGIN');
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  async function waitForPaymentRefReady(timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (
        paymentRef.current?.startCardPayment &&
        paymentRef.current?.ensureInit
      ) {
        return true;
      }
      await new Promise(r => setTimeout(r, 120));
    }
    return false;
  }

  // ---------- LOGIN ----------
  const handleLoginSuccess = async payload => {
    const token = payload?.token;
    if (!token) return Alert.alert('Login failed');

    setSession({token});

    const gate = await gateVerifyOrLogout('LOGIN');
    if (!gate.ok) return;

    go('CORP');
  };

  const handleLogout = () => hardLogoutToLogin();

  // ---------- AMOUNT ----------
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
    } else {
      subtotalCents = 0;
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

  // ---------- TIP ----------
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

  // ---------- CASH ----------
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

  // ---------- CARD ----------
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
        Alert.alert(
          'Preparing reader',
          'Please wait a moment, then try again.',
        );
        return;
      }

      await paymentRef.current.ensureInit?.();

      const isConnected = await paymentRef.current.isReaderConnected?.();
      if (!isConnected) {
        await paymentRef.current.connectReaderFlow?.();
      }

      await paymentRef.current.startCardPayment?.();
    } catch (e) {
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
    try {
      setReceipt(receiptPayload);
    } catch (e) {
      console.log('handlePaymentSuccess error:', e);
    } finally {
      setStripeEnabled(false);
      setIsReaderBusy(false);
      go('RECEIPT');
    }
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
          onLogout={handleLogout}
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
          onLogout={handleLogout}
          onStorePicked={() => go('TERMINAL')}
        />
      );

    if (screen === 'TERMINAL')
      return (
        <TerminalScreen
          theme={theme}
          onBackToStoreSelect={() => go('STORE')}
          onGoToTip={() => go('AMOUNT')}
          readerStatus={{connected: false, label: ''}}
          isReaderBusy={isReaderBusy}
          chargeData={chargeData}
          terminalStatusLine={terminalStatusLine}
          onConnectReader={async () => {
            const gate = await gateVerifyOrLogout('PRE_CONNECT_READER');
            if (!gate.ok) return;

            setStripeEnabled(true);

            const ready = await waitForPaymentRefReady();
            if (!ready) {
              Alert.alert('Preparing reader', 'Please try again in a moment.');
              return;
            }

            setIsReaderBusy(true);
            try {
              await paymentRef.current.ensureInit?.();
              await paymentRef.current.connectReaderFlow?.();
            } finally {
              setIsReaderBusy(false);
            }
          }}
          onDisconnectReader={async () => {
            const ready = await waitForPaymentRefReady(1500);
            if (!ready) return;

            setIsReaderBusy(true);
            try {
              await paymentRef.current.disconnectReaderFlow?.();
            } finally {
              setIsReaderBusy(false);
            }
          }}
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
          onCancel={async () => {
            setReceipt(null);
            setChargeData(null);
            setStripeEnabled(false);
            setIsReaderBusy(false);
            setTerminalStatusLine('');
            go('TERMINAL');
          }}
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

  const shouldRenderPaymentTerminal =
    !!session?.token && stripeEnabled && screen === 'TERMINAL';

  return (
    <StripeTerminalProvider
      tokenProvider={terminalTokenProvider}
      logLevel="verbose">
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

        {shouldRenderPaymentTerminal ? (
          <PaymentTerminal
            ref={paymentRef}
            amountCents={Number(chargeData?.totalCents || 0)}
            currency={chargeData?.currency || 'usd'}
            amountLabel={chargeData?.totalLabel || null}
            breakdown={chargeData || null}
            onReaderStatusChange={() => {}}
            onPaymentSuccess={handlePaymentSuccess}
            onTerminalStatusLine={setTerminalStatusLine}
          />
        ) : null}
      </SafeAreaView>
    </StripeTerminalProvider>
  );
}
