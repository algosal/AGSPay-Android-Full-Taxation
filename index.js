// index.js
// index.js
import {AppRegistry, Alert} from 'react-native';
import React from 'react';
import {StripeTerminalProvider} from '@stripe/stripe-terminal-react-native';
import App from './App';
import {name as appName} from './app.json';

const CONNECTION_TOKEN_URL =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/connection_token';

/**
 * Stripe Terminal requires a tokenProvider that returns a connection token string.
 * Your API returns: { statusCode:200, body:"{\"secret\":\"pst_live_...\"}" }
 */
async function tokenProvider() {
  try {
    console.log(
      '🔌 Stripe Terminal tokenProvider → URL:',
      CONNECTION_TOKEN_URL,
    );
    console.log(
      '🔌 Stripe Terminal tokenProvider → requesting connection token',
    );

    const resp = await fetch(CONNECTION_TOKEN_URL, {method: 'POST'});
    const text = await resp.text();

    console.log('🔌 Stripe Terminal tokenProvider → HTTP:', resp.status, text);

    if (!resp.ok) {
      throw new Error(`Connection token HTTP ${resp.status}`);
    }

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    // Your lambda body is JSON string
    let bodyObj = null;
    try {
      bodyObj = parsed?.body ? JSON.parse(parsed.body) : null;
    } catch {
      bodyObj = null;
    }

    const secret = bodyObj?.secret;

    if (!secret) {
      throw new Error('Connection token missing "secret"');
    }

    console.log('✅ Stripe Terminal tokenProvider → got secret');
    return secret;
  } catch (e) {
    console.log('❌ Stripe Terminal tokenProvider error:', e);
    Alert.alert('Stripe Terminal', `Token error: ${String(e?.message || e)}`);
    throw e;
  }
}

function Root() {
  return (
    <StripeTerminalProvider tokenProvider={tokenProvider} logLevel="verbose">
      <App />
    </StripeTerminalProvider>
  );
}

AppRegistry.registerComponent(appName, () => Root);
