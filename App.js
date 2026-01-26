// FILE: App.js
import React, {useMemo, useRef, useState} from 'react';
import {Alert, SafeAreaView, StatusBar, View} from 'react-native';
import {StripeTerminalProvider} from '@stripe/stripe-terminal-react-native';

import Login from './components/Login/Login';
import CorporateSelectScreen from './components/CorporateSelect/CorporateSelectScreen';
import StoreSelectScreen from './components/StoreSelect/StoreSelectScreen';

import TerminalScreen from './components/Terminal/TerminalScreen';
import AmountEntryScreen from './components/Terminal/AmountEntryScreen';
import TipScreen from './components/Tip/TipScreen';
import CheckoutScreen from './components/Checkout/CheckoutScreen';
import ReceiptScreen from './components/Receipt/ReceiptScreen';

import PaymentTerminal from './components/PaymentTerminal';

const CONNECTION_TOKEN_URL =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/connection_token';

// ✅ Tax + Service Fee rules (edit these as needed)
const TAX_RATE = 0.08875; // 8.875%
const SERVICE_FEE_RATE = 0.03; // 3%

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

function safeCents(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export default function App() {
  const theme = useMemo(
    () => ({
      bg: '#020617',
      card: '#050814',
      text: '#ffffff',
      muted: '#9ca3af',
      border: '#1f2937',
      gold: '#d4af37',
      danger: '#ef4444',
    }),
    [],
  );

  const paymentRef = useRef(null);
  const startingCardRef = useRef(false);

  const [screen, setScreen] = useState('LOGIN');
  const [session, setSession] = useState(null);

  const [chargeData, setChargeData] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const [readerStatus, setReaderStatus] = useState({
    connected: false,
    label: '',
  });
  const [isReaderBusy, setIsReaderBusy] = useState(false);

  // ✅ New: drive the “big status” UI on TerminalScreen
  const [terminalStatusLine, setTerminalStatusLine] = useState('');

  // mount Stripe only when needed
  const [stripeEnabled, setStripeEnabled] = useState(false);

  function go(next) {
    console.log('🧭 NAV =>', next);
    setScreen(next);
  }

  async function waitForPaymentRefReady(timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (
        paymentRef.current?.startCardPayment &&
        paymentRef.current?.ensureInit
      )
        return true;
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
  const handleAmountDone = ({amountCents}) => {
    const subtotalCents = safeCents(amountCents);

    // ✅ Compute from subtotal
    const taxCents = safeCents(Math.round(subtotalCents * TAX_RATE));
    const albaFeeCents = safeCents(
      Math.round(subtotalCents * SERVICE_FEE_RATE),
    );

    const totalCents = safeCents(subtotalCents + taxCents + albaFeeCents);

    setChargeData({
      method: 'CASH', // still default until Checkout chooses card
      currency: 'usd',
      subtotalCents,
      taxCents,
      albaFeeCents,
      tipCents: 0,
      totalCents,
      totalLabel: centsToMoney(totalCents),
    });

    go('TIP');
  };

  // ---------- TIP ----------
  const handleTipDone = ({tipCents}) => {
    const prev = chargeData || {
      subtotalCents: 0,
      taxCents: 0,
      albaFeeCents: 0,
      tipCents: 0,
      currency: 'usd',
    };

    const tip = safeCents(tipCents);

    const totalCents = safeCents(
      safeCents(prev.subtotalCents) +
        safeCents(prev.taxCents) +
        safeCents(prev.albaFeeCents) +
        tip,
    );

    setChargeData({
      ...prev,
      tipCents: tip,
      totalCents,
      totalLabel: centsToMoney(totalCents),
    });

    go('CHECKOUT');
  };

  // ---------- CASH ----------
  const handleCashReceipt = data => {
    // Ensure receipt contains the line items so ReceiptScreen prints them.
    const d = data || chargeData || {};
    setReceipt({
      ...(d || {}),
      method: 'CASH',
      paymentMethod: 'CASH',
      createdAtText: new Date().toLocaleString(),
    });
    go('RECEIPT');
  };

  // ---------- CARD (run entirely via PaymentTerminal, no CardTap screen) ----------
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

      // init once (safe if already initialized)
      await paymentRef.current.ensureInit?.();

      // connect if needed (PaymentTerminal itself also guards "already connected")
      const isConnected = await paymentRef.current.isReaderConnected?.();
      if (!isConnected) {
        await paymentRef.current.connectReaderFlow?.();
      }

      // start payment (will not rediscover if already connected)
      await paymentRef.current.startCardPayment?.();
    } catch (e) {
      Alert.alert('Payment failed', String(e?.message || e));
    } finally {
      setIsReaderBusy(false);
      startingCardRef.current = false;
    }
  };

  const handleCardConfirm = async data => {
    // data is chargeData from CheckoutScreen; keep it as the breakdown for PaymentTerminal.
    setChargeData(data);
    go('TERMINAL'); // keep employee on Terminal screen
    // important: run after navigation kicks in so Stripe can mount
    setTimeout(startCardFlowNow, 0);
  };

  const handlePaymentSuccess = receiptPayload => {
    // Ensure receipt includes the line items used by ReceiptScreen.
    // PaymentTerminal already includes breakdown; this makes printing deterministic.
    const b = receiptPayload?.breakdown || chargeData || {};

    setReceipt({
      ...(receiptPayload || {}),
      subtotalCents: safeCents(
        receiptPayload?.subtotalCents ?? b.subtotalCents,
      ),
      taxCents: safeCents(receiptPayload?.taxCents ?? b.taxCents),
      albaFeeCents: safeCents(receiptPayload?.albaFeeCents ?? b.albaFeeCents),
      tipCents: safeCents(receiptPayload?.tipCents ?? b.tipCents),
    });

    setStripeEnabled(false);
    setIsReaderBusy(false);
    go('RECEIPT');
  };

  // ---------- UI ----------
  const content = (() => {
    if (screen === 'LOGIN')
      return <Login theme={theme} onLoginSuccess={handleLoginSuccess} />;

    if (screen === 'CORP')
      return (
        <CorporateSelectScreen
          theme={theme}
          onLogout={handleLogout}
          onCorporatePicked={() => go('STORE')}
        />
      );

    if (screen === 'STORE')
      return (
        <StoreSelectScreen
          theme={theme}
          onBack={() => go('CORP')}
          onLogout={handleLogout}
          onStorePicked={() => go('TERMINAL')}
        />
      );

    if (screen === 'TERMINAL')
      return (
        <TerminalScreen
          onBackToStoreSelect={() => go('STORE')}
          onGoToTip={() => go('AMOUNT')}
          readerStatus={readerStatus}
          isReaderBusy={isReaderBusy}
          chargeData={chargeData}
          terminalStatusLine={terminalStatusLine} // ✅ show big status line
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
          receipt={receipt}
          onDone={() => {
            setReceipt(null);
            setChargeData(null);
            setStripeEnabled(false);
            setIsReaderBusy(false);
            setTerminalStatusLine('');
            go('TERMINAL');
          }}
        />
      );

    return <View />;
  })();

  // Mount Stripe only when logged in + enabled + we are on Terminal.
  // (This prevents background connect/disconnect conflicts.)
  const shouldMountStripe =
    !!session?.token && stripeEnabled && screen === 'TERMINAL';

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: theme.bg}}>
      <StatusBar barStyle="light-content" />
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
              onTerminalStatusLine={setTerminalStatusLine} // ✅ publish big status
            />
          </StripeTerminalProvider>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
