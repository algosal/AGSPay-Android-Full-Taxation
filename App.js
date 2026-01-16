import React, {useEffect, useState} from 'react';
import {Alert, View, ActivityIndicator} from 'react-native';
import {StripeTerminalProvider} from '@stripe/stripe-terminal-react-native';
import * as Keychain from 'react-native-keychain';

import Login from './components/Login/Login.jsx';
import CorporateSelectScreen from './components/CorporateSelect/CorporateSelectScreen.js';
import StoreSelectScreen from './components/StoreSelect/StoreSelectScreen.js';
import TerminalScreen from './components/Terminal/TerminalScreen.jsx';
import TipScreen from './components/Tip/TipScreen.js';
import CheckoutScreen from './components/Checkout/CheckoutScreen.js';
import ReceiptScreen from './components/Receipt/ReceiptScreen.js';

const API_BASE =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe';

async function fetchConnectionToken() {
  const response = await fetch(`${API_BASE}/connection_token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
  });

  const data = await response.json();

  if (typeof data?.body === 'string') {
    const parsed = JSON.parse(data.body);
    return parsed.secret;
  }

  return data.secret;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function readAgpaySelection() {
  try {
    const creds = await Keychain.getInternetCredentials('agpaySelection');
    if (!creds || !creds.password) return null;
    return safeJsonParse(creds.password);
  } catch (e) {
    console.log('readAgpaySelection error:', e);
    return null;
  }
}

function isValidSelection(sel) {
  return !!(sel?.ownerId && sel?.corporateRef && sel?.storeRef);
}

async function clearInternetCredential(serverName) {
  try {
    await Keychain.resetInternetCredentials(serverName);
  } catch (e) {
    console.log(`resetInternetCredentials(${serverName}) error:`, e);
  }
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);

  const [selection, setSelection] = useState(null);
  const [pickedCorporate, setPickedCorporate] = useState(null);

  // terminal -> tip -> checkout -> receipt
  const [step, setStep] = useState('terminal');

  // payloads between steps
  const [paymentNote, setPaymentNote] = useState('');
  const [tipPayload, setTipPayload] = useState(null);
  const [checkoutPayload, setCheckoutPayload] = useState(null);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setBooting(true);
        const creds = await Keychain.getGenericPassword();
        const isAuthed = !!creds;
        setAuthed(isAuthed);

        if (!isAuthed) {
          setStep('terminal');
          return;
        }

        const sel = await readAgpaySelection();
        const valid = isValidSelection(sel) ? sel : null;
        setSelection(valid);

        // If no selection, force corporate->store selection
        if (!valid) {
          setStep('corporate');
        } else {
          setStep('terminal');
        }
      } catch (e) {
        console.log('Boot error:', e);
        setAuthed(false);
        setStep('terminal');
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const handleLogout = async () => {
    try {
      await Keychain.resetGenericPassword();
      await clearInternetCredential('agpayAuth');
      await clearInternetCredential('agpaySelection');
      await clearInternetCredential('agpayLastTx');
    } catch (e) {
      console.log('Logout error:', e);
      Alert.alert('Logout error', String(e?.message || e));
    } finally {
      setAuthed(false);
      setSelection(null);
      setPickedCorporate(null);
      setTipPayload(null);
      setCheckoutPayload(null);
      setReceipt(null);
      setPaymentNote('');
      setStep('terminal');
    }
  };

  const handleLoginSuccess = async () => {
    setAuthed(true);

    const sel = await readAgpaySelection();
    const valid = isValidSelection(sel) ? sel : null;
    setSelection(valid);

    if (!valid) {
      setStep('corporate');
    } else {
      setStep('terminal');
    }
  };

  const handleCorporatePicked = corp => {
    setPickedCorporate(corp);
    setStep('store');
  };

  const handleStoreSelectionCompleted = async () => {
    const sel = await readAgpaySelection();
    const valid = isValidSelection(sel) ? sel : null;
    setSelection(valid);
    if (!valid) {
      Alert.alert('Selection error', 'Store selection did not save correctly.');
      setStep('corporate');
      return;
    }
    setStep('terminal');
  };

  // Terminal -> Tip
  const handleGoToTip = payloadFromTerminal => {
    setTipPayload(payloadFromTerminal);
    setStep('tip');
  };

  // Tip -> Checkout
  const handleTipDone = payloadFromTip => {
    // TipScreen gives us grandTotalCents
    const baseAmountCents = Number(tipPayload?.baseAmountCents || 0);

    setCheckoutPayload({
      method: payloadFromTip?.method, // CASH or CARD
      baseAmountCents,
      tipCents: Number(payloadFromTip?.tipCents || 0),
      grandTotalCents: Number(payloadFromTip?.grandTotalCents || 0),
      grandTotalLabel: payloadFromTip?.grandTotalLabel || '',
      currency: tipPayload?.currency || payloadFromTip?.currency || 'usd',
      paymentNote: tipPayload?.paymentNote || paymentNote || '',
      corporateName: selection?.corporateName || '',
      storeName: selection?.storeName || '',
    });

    setStep('checkout');
  };

  // Checkout -> Receipt
  const handlePaid = receiptPayload => {
    console.log('✅ PAID => receipt:', receiptPayload);
    setReceipt(receiptPayload || {});
    setStep('receipt');
  };

  const handleReceiptDone = () => {
    setReceipt(null);
    setTipPayload(null);
    setCheckoutPayload(null);
    setPaymentNote('');
    setStep('terminal');
  };

  let content = null;

  if (booting) {
    content = (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        <ActivityIndicator size="large" />
      </View>
    );
  } else if (!authed) {
    content = <Login onLoginSuccess={handleLoginSuccess} />;
  } else if (step === 'corporate') {
    content = (
      <CorporateSelectScreen
        onCorporatePicked={handleCorporatePicked}
        onLogout={handleLogout}
      />
    );
  } else if (step === 'store') {
    content = (
      <StoreSelectScreen
        corporate={pickedCorporate}
        onSelectionCompleted={handleStoreSelectionCompleted}
        onBack={() => setStep('corporate')}
        onLogout={handleLogout}
      />
    );
  } else if (step === 'tip') {
    content = (
      <TipScreen
        baseAmountCents={tipPayload?.baseAmountCents}
        baseAmountLabel={tipPayload?.baseAmountLabel}
        currency={tipPayload?.currency || 'usd'}
        paymentNote={tipPayload?.paymentNote || paymentNote || ''}
        corporateName={selection?.corporateName || ''}
        storeName={selection?.storeName || ''}
        onBack={() => setStep('terminal')}
        onDone={handleTipDone}
      />
    );
  } else if (step === 'checkout') {
    content = (
      <CheckoutScreen
        method={checkoutPayload?.method}
        currency={checkoutPayload?.currency || 'usd'}
        paymentNote={checkoutPayload?.paymentNote || ''}
        corporateName={checkoutPayload?.corporateName || ''}
        storeName={checkoutPayload?.storeName || ''}
        baseAmountCents={checkoutPayload?.baseAmountCents || 0}
        tipCents={checkoutPayload?.tipCents || 0}
        grandTotalCents={checkoutPayload?.grandTotalCents || 0}
        grandTotalLabel={checkoutPayload?.grandTotalLabel || ''}
        onPaid={handlePaid}
        onBack={() => setStep('tip')}
        onLogout={handleLogout}
      />
    );
  } else if (step === 'receipt') {
    content = (
      <ReceiptScreen
        receipt={receipt}
        onBack={() => setStep('checkout')}
        onDone={handleReceiptDone}
        onLogout={handleLogout}
      />
    );
  } else {
    // terminal
    content = (
      <TerminalScreen
        paymentNote={paymentNote}
        setPaymentNote={setPaymentNote}
        onLogout={handleLogout}
        onChangeStoreRequested={() => {
          setPickedCorporate(null);
          setSelection(null);
          setStep('corporate');
        }}
        onGoToTip={handleGoToTip}
      />
    );
  }

  return (
    <StripeTerminalProvider
      publishableKey="pk_live_51SYsEQAdvMmqiwUl8MKhSBczlEIyFG2OQNPrkgIWlndxLdj2DoSab31Pl1DTK85Pws5RCJnFcusnCeNV6Vwn8oo9005E23RB8T"
      tokenProvider={fetchConnectionToken}
      logLevel="verbose">
      {content}
    </StripeTerminalProvider>
  );
}
