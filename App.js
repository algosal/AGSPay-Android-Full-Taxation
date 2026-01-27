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

// --- Tax/Fee constants (NYC) ---
const TAX_RATE = 0.0885; // 8.85%

async function tokenProvider() {
  const resp = await fetch(CONNECTION_TOKEN_URL, {method: 'POST'});
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Connection token HTTP ${resp.status}`);

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {}

  // supports both {secret:"..."} and {body:"{secret:'...'}"}
  let secret = data?.secret || null;
  if (!secret && typeof data?.body === 'string') {
    try {
      secret = JSON.parse(data.body)?.secret || null;
    } catch {}
  }

  if (!secret) throw new Error('Missing connection token');
  return secret;
}

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

/**
 * Service fee rule (your spec):
 * - fee = (2.7% of base + $0.05) + extra
 * - extra linearly ramps from $0.05 at $0 total to $0.50 at $100 total
 *   => extra = $0.05 + (min(total,100)/100)*$0.45
 * - minimum enforced: at least $0.05 (hard guard)
 *
 * base = subtotal + tax + tip
 */
function calcServiceFeeCents(baseCents) {
  const base = Math.max(0, Number(baseCents || 0));

  // 2.7% + 5 cents
  const percentPart = Math.round(base * 0.027);
  const fixedPart = 5;

  // extra ramp: 5c -> 50c over $0 -> $100
  const capped = Math.min(base, 10000); // $100 in cents
  const extra = 5 + Math.round((capped / 10000) * 45); // 5..50

  const fee = percentPart + fixedPart + extra;

  // minimum 5 cents
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

/**
 * ✅ IMPORTANT (Android):
 * setInternetCredentials() throws if username OR password is empty.
 * So we clear by storing a single space, and reading code should trim().
 *
 * This ONLY touches 'agpayComment' (NOT selection/auth).
 */
async function clearAgpayComment() {
  try {
    await Keychain.setInternetCredentials('agpayComment', 'comment', ' ');
    return true;
  } catch (e) {
    console.log('clearAgpayComment error:', e);
    return false;
  }
}

// ---------------------- Transaction payload logging ----------------------

function maskToken(t) {
  if (!t || typeof t !== 'string') return null;
  if (t.length <= 18) return '***';
  return t.slice(0, 10) + '…' + t.slice(-6);
}

function buildTransactionPayload({session, selection, chargeData, receipt}) {
  return {
    ownerId: session?.ownerId || session?.userId || null,
    email: session?.email || null,

    corporateId: selection?.corporateId || null,
    corporateRef: selection?.corporateRef || null,
    corporateName: selection?.corporateName || null,
    storeRef: selection?.storeRef || null,
    storeName: selection?.storeName || null,
    corpStoreKey: selection?.corpStoreKey || null,

    currency: chargeData?.currency || 'usd',
    subtotalCents: Number(chargeData?.subtotalCents || 0),
    taxCents: Number(chargeData?.taxCents || 0),
    albaFeeCents: Number(chargeData?.albaFeeCents || 0),
    tipCents: Number(chargeData?.tipCents || 0),
    totalCents: Number(chargeData?.totalCents || 0),

    method:
      receipt?.method || receipt?.paymentMethod || chargeData?.method || null,
    paymentId: receipt?.paymentId || null,
    chargeId: receipt?.chargeId || null,
    brand: receipt?.brand || null,
    last4: receipt?.last4 || null,

    createdAt: Date.now(),
    createdAtText: new Date().toLocaleString(),
  };
}

function logTransactionPayload(payload, token) {
  console.log('TX => about to send payload:', JSON.stringify(payload, null, 2));
  console.log('TX => auth token:', maskToken(token));
}

export default function App() {
  const paymentRef = useRef(null);
  const startingCardRef = useRef(false);

  // ✅ Boot gate prevents 1-second LOGIN flash
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

  // ✅ Theme toggle (light/dark)
  const [themeMode, setThemeMode] = useState('dark');
  const theme = useMemo(() => themes[themeMode] || themes.dark, [themeMode]);

  const toggleTheme = () => {
    setThemeMode(m => (m === 'dark' ? 'light' : 'dark'));
  };

  function go(next) {
    console.log('🧭 NAV =>', next);
    setScreen(next);
  }

  // ✅ BOOT: decide initial screen before rendering app
  useEffect(() => {
    (async () => {
      try {
        console.log('BOOT => checking saved auth + selection...');

        const token = await readAgpayAuthToken();
        const sel = await readAgpaySelection();
        const sess = await readAgpaySession();

        console.log('BOOT => token exists:', !!token);
        console.log('BOOT => selection:', sel);

        // ✅ Autologin safety: clear comment on app start if token exists
        // (prevents stale comment if vendor force-closed app mid-transaction)
        if (token) {
          await clearAgpayComment();
        }

        // store session in state if present
        if (sess?.token) setSession({token: sess.token});

        if (token && sel?.storeRef) {
          console.log('BOOT => store already selected, going TERMINAL');
          setScreen('TERMINAL');
        } else if (token && (sel?.corporateId || sel?.corporateRef)) {
          console.log('BOOT => corporate selected, going STORE');
          setScreen('STORE');
        } else if (token) {
          console.log('BOOT => token exists, going CORP');
          setScreen('CORP');
        } else {
          console.log('BOOT => no token, going LOGIN');
          setScreen('LOGIN');
        }
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
  const handleLoginSuccess = payload => {
    const token = payload?.token;
    if (!token) {
      Alert.alert('Login failed');
      return;
    }
    setSession({token});
    go('CORP');
  };

  const handleLogout = () => {
    setSession(null);
    setChargeData(null);
    setReceipt(null);
    setStripeEnabled(false);
    setReaderStatus({connected: false, label: ''});
    setIsReaderBusy(false);
    setTerminalStatusLine('');
    go('LOGIN');
  };

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
      method: 'CASH',
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
      method: 'CASH',
    };

    const subtotal = Number(prev.subtotalCents || 0);
    const tax = Number(prev.taxCents || 0);
    const tip = Math.max(0, Math.round(Number(tipCents || 0)));

    const baseCents = subtotal + tax + tip;
    const albaFeeCents = calcServiceFeeCents(baseCents);
    const totalCents = baseCents + albaFeeCents;

    setChargeData({
      ...prev,
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
      setStripeEnabled(true);
      setIsReaderBusy(true);

      const ready = await waitForPaymentRefReady();
      if (!ready) {
        Alert.alert(
          'Preparing reader',
          'Please wait a moment, then press CARD again.',
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

  // ✅ Log exactly what we would send to transactions table (masked token)
  const handlePaymentSuccess = async receiptPayload => {
    try {
      setReceipt(receiptPayload);

      const sess = await readAgpaySession();
      const sel = await readAgpaySelection();
      const token = await readAgpayAuthToken();

      const txPayload = buildTransactionPayload({
        session: sess,
        selection: sel,
        chargeData,
        receipt: receiptPayload,
      });

      logTransactionPayload(txPayload, token);

      // TODO: POST txPayload to your Transactions API when ready
    } catch (e) {
      console.log('handlePaymentSuccess => logging error:', e);
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
          readerStatus={readerStatus}
          isReaderBusy={isReaderBusy}
          chargeData={chargeData}
          terminalStatusLine={terminalStatusLine}
          onConnectReader={async () => {
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
            // ✅ clears in-memory txn state (ReceiptScreen already clears Keychain comment)
            setReceipt(null);
            setChargeData(null);
            setStripeEnabled(false);
            setIsReaderBusy(false);
            setTerminalStatusLine('');
          }}
          onDone={() => {
            go('TERMINAL');
          }}
        />
      );

    return <View />;
  })();

  // ✅ Floating toggle on screens EXCEPT CORP/STORE (to avoid collision w logout)
  const showFloatingToggle = screen !== 'CORP' && screen !== 'STORE';

  const shouldMountStripe =
    !!session?.token && stripeEnabled && screen === 'TERMINAL';

  return (
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

      {shouldMountStripe ? (
        <View
          style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0}}
          pointerEvents="none">
          <StripeTerminalProvider
            tokenProvider={tokenProvider}
            logLevel="verbose">
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
          </StripeTerminalProvider>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
