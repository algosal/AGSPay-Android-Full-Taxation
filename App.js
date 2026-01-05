// App.js (JS, not TSX)
import React, {useEffect, useState} from 'react';
import {Alert} from 'react-native';

import {StripeTerminalProvider} from '@stripe/stripe-terminal-react-native';
import * as Keychain from 'react-native-keychain';

import Login from './components/Login/Login';
import TerminalScreen from './components/Terminal/TerminalScreen';

import CorporateSelectScreen from './components/CorporateSelect/CorporateSelectScreen';
import StoreSelectScreen from './components/StoreSelect/StoreSelectScreen';

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------
const API_BASE =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe';

// -----------------------------------------------------------------------------
// STRIPE CONNECTION TOKEN
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// KEYCHAIN HELPERS
// -----------------------------------------------------------------------------
async function readAgpaySelection() {
  try {
    const creds = await Keychain.getInternetCredentials('agpaySelection');
    if (!creds || !creds.password) return null;
    return JSON.parse(creds.password);
  } catch (e) {
    console.log('readAgpaySelection error:', e);
    return null;
  }
}

async function clearInternetCredential(serverName) {
  try {
    const res = await Keychain.resetInternetCredentials({server: serverName});
    console.log(`resetInternetCredentials(${serverName}) =>`, res);
  } catch (e) {
    console.log(`resetInternetCredentials(${serverName}) error:`, e);
  }
}

// -----------------------------------------------------------------------------
// APP ROOT
// -----------------------------------------------------------------------------
export default function App() {
  const [paymentNote, setPaymentNote] = useState('');
  const [authed, setAuthed] = useState(false);

  const [selection, setSelection] = useState(null); // from Keychain agpaySelection
  const [step, setStep] = useState('terminal'); // 'corporate' | 'store' | 'terminal'
  const [pickedCorporate, setPickedCorporate] = useState(null);

  // Boot
  useEffect(() => {
    (async () => {
      try {
        const creds = await Keychain.getGenericPassword();
        console.log('BOOT Keychain generic =>', creds);

        const isAuthed = !!creds;
        setAuthed(isAuthed);

        if (!isAuthed) {
          setSelection(null);
          setPickedCorporate(null);
          setStep('terminal');
          return;
        }

        const sel = await readAgpaySelection();
        console.log('BOOT agpaySelection =>', sel);

        setSelection(sel);

        if (sel) {
          setPickedCorporate(null);
          setStep('terminal');
        } else {
          setPickedCorporate(null);
          setStep('corporate');
        }
      } catch (e) {
        console.log('Keychain boot read error:', e);
        setAuthed(false);
        setSelection(null);
        setPickedCorporate(null);
        setStep('terminal');
      }
    })();
  }, []);

  const handleLogout = async () => {
    try {
      const reset = await Keychain.resetGenericPassword();
      console.log('Logout resetGenericPassword =>', reset);

      // Clear JWT + selection so next login forces corp/store selection
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
      setStep('terminal');
    }
  };

  // Called by Login after backend auth + Keychain save
  const handleLoginSuccess = async () => {
    setAuthed(true);

    const sel = await readAgpaySelection();
    console.log('POST-LOGIN agpaySelection =>', sel);

    setSelection(sel);

    if (sel) {
      setPickedCorporate(null);
      setStep('terminal');
    } else {
      setPickedCorporate(null);
      setStep('corporate');
    }
  };

  // CorporateSelect -> user picks corporate
  const handleCorporatePicked = corp => {
    setPickedCorporate(corp);
    setStep('store');
  };

  // StoreSelect -> user picks store and writes agpaySelection to Keychain
  const handleSelectionCompleted = async () => {
    const sel = await readAgpaySelection();
    console.log('SELECTION COMPLETED agpaySelection =>', sel);

    setSelection(sel || null);

    if (sel) {
      setPickedCorporate(null);
      setStep('terminal');
    } else {
      setPickedCorporate(null);
      setStep('corporate');
    }
  };

  const handleBackToCorporates = () => {
    setPickedCorporate(null);
    setStep('corporate');
  };

  // ✅ THIS IS THE MISSING PIECE:
  // Called by TerminalScreen when user presses "Change Store"
  const handleChangeStoreRequested = async () => {
    console.log('ChangeStore requested => clearing selection + routing');

    // Clear Keychain selection (safe even if already cleared)
    await clearInternetCredential('agpaySelection');

    // Force UI back to corporate/store flow
    setSelection(null);
    setPickedCorporate(null);
    setStep('corporate');
  };

  // Decide what to render
  let content = null;

  if (!authed) {
    content = <Login onLoginSuccess={handleLoginSuccess} />;
  } else if (!selection && step === 'corporate') {
    content = (
      <CorporateSelectScreen
        onLogout={handleLogout}
        onCorporatePicked={handleCorporatePicked}
      />
    );
  } else if (!selection && step === 'store') {
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
      <TerminalScreen
        paymentNote={paymentNote}
        setPaymentNote={setPaymentNote}
        onLogout={handleLogout}
        onChangeStoreRequested={handleChangeStoreRequested} // ✅ PASS IT
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
