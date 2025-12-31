// App.js (JS, not TSX)
import React, {useEffect, useState} from 'react';
import {Alert} from 'react-native';

import {StripeTerminalProvider} from '@stripe/stripe-terminal-react-native';

import * as Keychain from 'react-native-keychain';

import Login from './components/Login/Login';
import TerminalScreen from './components/Terminal/TerminalScreen';

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
// APP ROOT (PERSISTENT LOGIN VIA KEYCHAIN GENERIC PASSWORD)
// -----------------------------------------------------------------------------

export default function App() {
  const [paymentNote, setPaymentNote] = useState('');
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const creds = await Keychain.getGenericPassword();
        console.log('BOOT Keychain generic =>', creds);
        setAuthed(!!creds);
      } catch (e) {
        console.log('Keychain boot read error:', e);
        setAuthed(false);
      }
    })();
  }, []);

  const handleLogout = async () => {
    try {
      const reset = await Keychain.resetGenericPassword();
      console.log('Logout resetGenericPassword =>', reset);
    } catch (e) {
      console.log('Logout error:', e);
      Alert.alert('Logout error', String(e?.message || e));
    } finally {
      setAuthed(false);
      setPaymentNote('');
    }
  };

  return (
    <StripeTerminalProvider
      tokenProvider={fetchConnectionToken}
      logLevel="verbose">
      {authed ? (
        <TerminalScreen
          paymentNote={paymentNote}
          setPaymentNote={setPaymentNote}
          onLogout={handleLogout}
        />
      ) : (
        <Login onLoginSuccess={() => setAuthed(true)} />
      )}
    </StripeTerminalProvider>
  );
}
