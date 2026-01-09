import React, {useEffect, useState} from 'react';
import {Alert, View, ActivityIndicator} from 'react-native';

import {StripeTerminalProvider} from '@stripe/stripe-terminal-react-native';
import * as Keychain from 'react-native-keychain';

import Login from './components/Login/Login.jsx';
import TerminalScreen from './components/Terminal/TerminalScreen.jsx';

import CorporateSelectScreen from './components/CorporateSelect/CorporateSelectScreen';
import StoreSelectScreen from './components/StoreSelect/StoreSelectScreen';
import ReceiptScreen from './components/Receipt/ReceiptScreen';

import TipScreen from './components/Tip/TipScreen.js';
import CheckoutScreen from './components/Checkout/CheckoutScreen.js';

const API_BASE =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe';

async function fetchConnectionToken() {
  const response = await fetch(`${API_BASE}/connection_token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
  });

  const data = await response.json();

  if (typeof data.body === 'string') {
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
    const res = await Keychain.resetInternetCredentials(serverName);
    console.log(`resetInternetCredentials(${serverName}) =>`, res);
  } catch (e) {
    console.log(`resetInternetCredentials(${serverName}) error:`, e);
  }
}

export default function App() {
  const [paymentNote, setPaymentNote] = useState('');

  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);

  const [selection, setSelection] = useState(null);

  // 'corporate' | 'store' | 'terminal' | 'tip' | 'checkout' | 'receipt'
  const [step, setStep] = useState('corporate');

  const [pickedCorporate, setPickedCorporate] = useState(null);
  const [terminalResetKey, setTerminalResetKey] = useState(0);

  const [receipt, setReceipt] = useState(null);

  // payload from Terminal -> Tip
  const [tipBase, setTipBase] = useState(null);

  // payload from Tip -> Checkout
  const [checkout, setCheckout] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setBooting(true);

        const creds = await Keychain.getGenericPassword();
        console.log('BOOT Keychain generic =>', creds);

        const isAuthed = !!creds;
        setAuthed(isAuthed);

        if (!isAuthed) {
          setSelection(null);
          setPickedCorporate(null);
          setReceipt(null);
          setTipBase(null);
          setCheckout(null);
          setStep('corporate');
          return;
        }

        const sel = await readAgpaySelection();
        console.log('BOOT agpaySelection =>', sel);

        const validSel = isValidSelection(sel) ? sel : null;
        setSelection(validSel);

        setPickedCorporate(null);
        setReceipt(null);
        setTipBase(null);
        setCheckout(null);
        setStep(validSel ? 'terminal' : 'corporate');
      } catch (e) {
        console.log('Keychain boot read error:', e);
        setAuthed(false);
        setSelection(null);
        setPickedCorporate(null);
        setReceipt(null);
        setTipBase(null);
        setCheckout(null);
        setStep('corporate');
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const handleLogout = async () => {
    try {
      const reset = await Keychain.resetGenericPassword();
      console.log('Logout resetGenericPassword =>', reset);

      await clearInternetCredential('agpayAuth');
      await clearInternetCredential('agpaySelection');
    } catch (e) {
      console.log('Logout error:', e);
      Alert.alert('Logout error', String(e?.message || e));
    } finally {
      setAuthed(false);
      setPaymentNote('');
      setSelection(null);
      setPickedCorporate(null);
      setReceipt(null);
      setTipBase(null);
      setCheckout(null);
      setStep('corporate');
      setTerminalResetKey(0);
    }
  };

  const handleLoginSuccess = async () => {
    setAuthed(true);

    const sel = await readAgpaySelection();
    console.log('POST-LOGIN agpaySelection =>', sel);

    const validSel = isValidSelection(sel) ? sel : null;
    setSelection(validSel);

    setPickedCorporate(null);
    setReceipt(null);
    setTipBase(null);
    setCheckout(null);

    setStep(validSel ? 'terminal' : 'corporate');
  };

  const handleCorporatePicked = corp => {
    if (!corp?.corporateId) {
      Alert.alert('Select corporate', 'Please choose a corporate to continue.');
      return;
    }
    setPickedCorporate(corp);
    setStep('store');
  };

  const handleSelectionCompleted = async () => {
    const sel = await readAgpaySelection();
    console.log('SELECTION COMPLETED agpaySelection =>', sel);

    const validSel = isValidSelection(sel) ? sel : null;
    setSelection(validSel);

    if (validSel) {
      setPickedCorporate(null);
      setReceipt(null);
      setTipBase(null);
      setCheckout(null);
      setStep('terminal');
    } else {
      Alert.alert('Selection required', 'Please select a store to continue.');
      setPickedCorporate(null);
      setReceipt(null);
      setTipBase(null);
      setCheckout(null);
      setStep('corporate');
    }
  };

  const handleBackToCorporates = () => {
    setPickedCorporate(null);
    setStep('corporate');
  };

  const handleChangeStoreRequested = async () => {
    console.log('ChangeStore requested => clearing selection + routing');

    await clearInternetCredential('agpaySelection');

    setSelection(null);
    setPickedCorporate(null);
    setReceipt(null);
    setTipBase(null);
    setCheckout(null);
    setStep('corporate');
  };

  // Terminal -> Tip
  const handleGoToTip = basePayload => {
    console.log('GO TO TIP => basePayload:', basePayload);
    setTipBase(basePayload || null);
    setCheckout(null);
    setStep('tip');
  };

  // Tip -> Checkout
  const handleTipDone = tipResult => {
    console.log('TIP DONE =>', tipResult);

    const method = tipResult?.method;
    if (!method) {
      Alert.alert('Missing method', 'Please choose Cash or Card.');
      return;
    }

    setCheckout({
      method,
      baseAmountCents: tipBase?.baseAmountCents || 0,
      tipCents: tipResult?.tipCents || 0,
      currency: tipResult?.currency || 'usd',
      paymentNote: tipBase?.paymentNote || '',
      corporateName: tipBase?.corporateName || '',
      storeName: tipBase?.storeName || '',
    });

    // ✅ go directly to checkout (NOT terminal)
    setStep('checkout');
  };

  const handleTipBack = () => {
    setTipBase(null);
    setCheckout(null);
    setStep('terminal');
  };

  // Checkout -> Receipt
  const handlePaid = receiptData => {
    console.log('PAID => receipt:', receiptData);

    setPaymentNote('');
    setTerminalResetKey(k => k + 1);

    setReceipt(receiptData || {});
    setTipBase(null);
    setCheckout(null);
    setStep('receipt');
  };

  const handleReceiptDone = () => {
    setReceipt(null);
    setTipBase(null);
    setCheckout(null);
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
  } else if (!isValidSelection(selection)) {
    if (step === 'store') {
      content = (
        <StoreSelectScreen
          onLogout={handleLogout}
          onBack={handleBackToCorporates}
          corporate={pickedCorporate}
          onSelectionCompleted={handleSelectionCompleted}
        />
      );
    } else {
      content = (
        <CorporateSelectScreen
          onLogout={handleLogout}
          onCorporatePicked={handleCorporatePicked}
        />
      );
    }
  } else if (step === 'tip') {
    content = (
      <TipScreen
        baseAmountCents={tipBase?.baseAmountCents}
        baseAmountLabel={tipBase?.baseAmountLabel}
        currency={tipBase?.currency || 'usd'}
        paymentNote={tipBase?.paymentNote || ''}
        corporateName={tipBase?.corporateName || ''}
        storeName={tipBase?.storeName || ''}
        onBack={handleTipBack}
        onDone={handleTipDone}
      />
    );
  } else if (step === 'checkout') {
    content = (
      <CheckoutScreen
        method={checkout?.method}
        baseAmountCents={checkout?.baseAmountCents}
        tipCents={checkout?.tipCents}
        currency={checkout?.currency || 'usd'}
        paymentNote={checkout?.paymentNote || ''}
        corporateName={checkout?.corporateName || ''}
        storeName={checkout?.storeName || ''}
        onBack={() => setStep('tip')}
        onPaid={handlePaid}
      />
    );
  } else if (step === 'receipt') {
    content = (
      <ReceiptScreen
        receipt={receipt}
        onDone={handleReceiptDone}
        onLogout={handleLogout}
      />
    );
  } else {
    content = (
      <TerminalScreen
        key={`terminal-${terminalResetKey}`}
        paymentNote={paymentNote}
        setPaymentNote={setPaymentNote}
        onLogout={handleLogout}
        onChangeStoreRequested={handleChangeStoreRequested}
        onGoToTip={handleGoToTip}
      />
    );
  }

  return (
    <StripeTerminalProvider
      tokenProvider={fetchConnectionToken}
      logLevel="verbose">
      {content}
    </StripeTerminalProvider>
  );
}
