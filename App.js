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

  // Amount -> chargeData subtotal
  const handleAmountDone = payload => {
    const subtotalCents = Number(payload?.amountCents || 0);

    setChargeData({
      method: 'CARD', // default; TipScreen can set CASH
      currency: 'usd',
      subtotalCents,
      taxCents: 0,
      albaFeeCents: 0,
      tipCents: 0,
      totalCents: subtotalCents,
      totalLabel: centsToMoney(subtotalCents),
      paymentNote: paymentNote || '',
    });

    go('TIP');
  };

  // TipScreen returns payload with method and totals
  const handleTipDone = tipPayload => {
    setChargeData(tipPayload);
    go('CHECKOUT');
  };

  const handleCheckoutConfirm = confirmedData => {
    setChargeData(confirmedData);
    go('TERMINAL');
  };

  const handlePaymentSuccess = receiptPayload => {
    setReceipt(receiptPayload || null);
    setStripeEnabled(false);
    go('RECEIPT');
  };

  const handleCashReceipt = () => {
    const amt = Number(chargeData?.totalCents || 0);
    if (!amt || amt < 1) {
      Alert.alert('No amount', 'Enter an amount first.');
      return;
    }

    setReceipt({
      method: 'CASH',
      paymentMethod: 'CASH',
      amountCents: amt,
      amountText: chargeData?.totalLabel || centsToMoney(amt),
      currency: chargeData?.currency || 'usd',
      totalCents: amt,
      grandTotalCents: amt,
      breakdown: chargeData || null,
      createdAtText: new Date().toLocaleString(),
    });

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
          onCashReceipt={handleCashReceipt}
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
      return <TipScreen onBack={() => go('AMOUNT')} onDone={handleTipDone} />;
    }

    if (screen === 'CHECKOUT') {
      return (
        <CheckoutScreen
          chargeData={chargeData}
          onBack={() => go('TIP')}
          onConfirm={handleCheckoutConfirm}
          isBusy={false}
        />
      );
    }

    if (screen === 'RECEIPT') {
      return (
        <ReceiptScreen
          theme={theme}
          receipt={receipt}
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
