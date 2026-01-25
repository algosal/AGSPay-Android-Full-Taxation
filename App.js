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

async function tokenProvider() {
  const resp = await fetch(CONNECTION_TOKEN_URL, {method: 'POST'});
  const text = await resp.text();

  if (!resp.ok) throw new Error(`Connection token HTTP ${resp.status}`);

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}

  let secret = data?.secret || null;

  if (!secret && data?.body) {
    try {
      const body = JSON.parse(data.body);
      secret = body?.secret || null;
    } catch {}
  }

  if (!secret) throw new Error('Missing connection token secret');
  return secret;
}

function normalizeLoginPayload(payload) {
  if (payload && typeof payload === 'object' && payload.token) return payload;

  if (
    payload &&
    typeof payload === 'object' &&
    typeof payload.body === 'string'
  ) {
    try {
      return JSON.parse(payload.body);
    } catch {
      return null;
    }
  }

  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  return null;
}

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
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

  const [screen, setScreen] = useState('LOGIN');
  const [session, setSession] = useState(null);

  const [paymentNote, setPaymentNote] = useState('');
  const [chargeData, setChargeData] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const [readerStatus, setReaderStatus] = useState({
    connected: false,
    label: '',
  });
  const [isReaderBusy, setIsReaderBusy] = useState(false);

  // ✅ Stripe is enabled only when user taps CONNECT / CHARGE (prevents overlay stealing taps)
  const [stripeEnabled, setStripeEnabled] = useState(false);

  const loginSuccessHandledRef = useRef(false);

  function go(next) {
    console.log('🧭 NAV =>', next);
    setScreen(next);
  }

  const handleLoginSuccess = payloadFromLogin => {
    try {
      if (loginSuccessHandledRef.current) return;

      const normalized = normalizeLoginPayload(payloadFromLogin);
      const token = normalized?.token || null;

      if (!token) {
        Alert.alert('Login failed', 'Missing token in login response.');
        return;
      }

      loginSuccessHandledRef.current = true;

      setSession({
        token,
        ownerId: normalized?.profile?.userId || normalized?.ownerId || null,
        profile: normalized?.profile || null,
      });

      go('CORP');
    } catch (e) {
      Alert.alert('Login failed', String(e?.message || e));
    }
  };

  const handleLogout = () => {
    loginSuccessHandledRef.current = false;
    setSession(null);
    setReceipt(null);
    setChargeData(null);
    setPaymentNote('');
    setReaderStatus({connected: false, label: ''});
    setIsReaderBusy(false);
    setStripeEnabled(false);
    go('LOGIN');
  };

  // AMOUNT -> sets base totals
  const handleAmountDone = payload => {
    const subtotalCents = Number(payload?.amountCents || 0);

    const base = {
      method: 'CARD', // default, Checkout can change this
      currency: 'usd',

      subtotalCents,
      taxCents: 0,
      albaFeeCents: 0,
      tipCents: 0,

      totalCents: subtotalCents,
      totalLabel: centsToMoney(subtotalCents),

      paymentNote: paymentNote || '',
    };

    setChargeData(base);
    go('TIP');
  };

  // ✅ IMPORTANT FIX:
  // TipScreen currently returns { tipCents } only.
  // We must MERGE tip into existing chargeData and recompute total.
  const handleTipDone = tipPayload => {
    setChargeData(prev => {
      const p = prev || {};
      const subtotalCents = Number(p.subtotalCents || 0);
      const taxCents = Number(p.taxCents || 0);
      const albaFeeCents = Number(p.albaFeeCents || 0);
      const tipCents = Number(tipPayload?.tipCents || 0);

      const totalCents = subtotalCents + taxCents + albaFeeCents + tipCents;

      return {
        ...p,
        tipCents,
        totalCents,
        totalLabel: centsToMoney(totalCents),
      };
    });

    go('CHECKOUT');
  };

  // CASH: create receipt + go to RECEIPT
  const handleCashConfirm = dataFromCheckout => {
    const d = dataFromCheckout || chargeData || {};
    const amt = Number(d.totalCents || 0);

    if (!amt || amt < 1) {
      Alert.alert('No amount', 'Enter an amount first.');
      return;
    }

    setChargeData(d);

    setReceipt({
      ...d,
      method: 'CASH',
      paymentMethod: 'CASH',
      amountCents: amt,
      amountText: d.totalLabel || centsToMoney(amt),
      totalCents: amt,
      grandTotalCents: amt,
      breakdown: d || null,
      createdAtText: new Date().toLocaleString(),
    });

    setStripeEnabled(false);
    go('RECEIPT');
  };

  // CARD: set method + go to TERMINAL for connect/charge
  const handleCardConfirm = dataFromCheckout => {
    const d = dataFromCheckout || chargeData || {};
    const amt = Number(d.totalCents || 0);

    if (!amt || amt < 1) {
      Alert.alert('No amount', 'Enter an amount first.');
      return;
    }

    setChargeData({
      ...d,
      method: 'CARD',
    });

    // Stripe provider stays disabled until CONNECT/CHARGE is tapped on Terminal
    setStripeEnabled(false);
    go('TERMINAL');
  };

  const handlePaymentSuccess = receiptPayload => {
    setReceipt(receiptPayload || null);
    setStripeEnabled(false);
    go('RECEIPT');
  };

  const content = (() => {
    if (screen === 'LOGIN') {
      return <Login theme={theme} onLoginSuccess={handleLoginSuccess} />;
    }

    if (screen === 'CORP') {
      return (
        <CorporateSelectScreen
          theme={theme}
          onLogout={handleLogout}
          onCorporatePicked={() => go('STORE')}
        />
      );
    }

    if (screen === 'STORE') {
      return (
        <StoreSelectScreen
          theme={theme}
          onBack={() => go('CORP')}
          onLogout={handleLogout}
          onStorePicked={() => go('TERMINAL')}
        />
      );
    }

    if (screen === 'TERMINAL') {
      return (
        <TerminalScreen
          paymentNote={paymentNote}
          setPaymentNote={setPaymentNote}
          onBackToStoreSelect={() => go('STORE')}
          onGoToTip={() => go('AMOUNT')}
          readerStatus={readerStatus}
          isReaderBusy={isReaderBusy}
          chargeData={chargeData}
          onConnectReader={async () => {
            // ✅ enable Stripe only when needed
            setStripeEnabled(true);

            if (!paymentRef.current?.connectReaderFlow) {
              Alert.alert('Missing', 'PaymentTerminal ref not ready.');
              return;
            }
            setIsReaderBusy(true);
            try {
              await paymentRef.current.connectReaderFlow();
            } finally {
              setIsReaderBusy(false);
            }
          }}
          onDisconnectReader={async () => {
            if (!paymentRef.current?.disconnectReaderFlow) return;
            setIsReaderBusy(true);
            try {
              await paymentRef.current.disconnectReaderFlow();
            } finally {
              setIsReaderBusy(false);
            }
          }}
          onChargeCard={async () => {
            // ✅ enable Stripe only when needed
            setStripeEnabled(true);

            if (!paymentRef.current?.startCardPayment) return;
            await paymentRef.current.startCardPayment();
          }}
        />
      );
    }

    if (screen === 'AMOUNT') {
      return (
        <AmountEntryScreen
          theme={theme}
          onBack={() => go('TERMINAL')}
          onDone={handleAmountDone}
        />
      );
    }

    if (screen === 'TIP') {
      return (
        <TipScreen
          chargeData={chargeData}
          onBack={() => go('AMOUNT')}
          onDone={handleTipDone}
          theme={theme}
        />
      );
    }

    if (screen === 'CHECKOUT') {
      return (
        <CheckoutScreen
          chargeData={chargeData}
          onBack={() => go('TIP')}
          onCashConfirm={handleCashConfirm}
          onCardConfirm={handleCardConfirm}
          isBusy={false}
        />
      );
    }

    if (screen === 'RECEIPT') {
      return (
        <ReceiptScreen
          theme={theme}
          receipt={receipt}
          onBack={() => go('TERMINAL')}
          onDone={() => {
            setReceipt(null);
            setChargeData(null);
            setPaymentNote('');
            setStripeEnabled(false);
            go('TERMINAL');
          }}
        />
      );
    }

    return <View />;
  })();

  const isLoggedIn = !!session?.token;

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: theme.bg}}>
      <StatusBar barStyle="light-content" />
      {content}

      {/* Stripe Terminal is mounted ONLY when user requests CONNECT/CHARGE */}
      {isLoggedIn && screen === 'TERMINAL' && stripeEnabled ? (
        <View
          pointerEvents="none"
          style={{position: 'absolute', left: 0, top: 0, right: 0, bottom: 0}}>
          <StripeTerminalProvider
            tokenProvider={tokenProvider}
            logLevel="verbose">
            <PaymentTerminal
              ref={paymentRef}
              amountCents={Number(chargeData?.totalCents || 0)}
              currency={chargeData?.currency || 'usd'}
              amountLabel={chargeData?.totalLabel || null}
              debugMeta={{note: chargeData?.paymentNote || ''}}
              breakdown={chargeData || null}
              onReaderStatusChange={setReaderStatus}
              onPaymentSuccess={handlePaymentSuccess}
            />
          </StripeTerminalProvider>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
