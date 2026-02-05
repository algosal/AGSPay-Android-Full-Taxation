// FILE: components/StripeTerminalRoot.jsx
import React, {useCallback} from 'react';
import {Alert} from 'react-native';
import {StripeTerminalProvider} from '@stripe/stripe-terminal-react-native';
import {readAgpayAuthToken} from './utils/agpayAuth';

// CHANGE THIS to your real connection-token endpoint:
const CONNECTION_TOKEN_URL =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/connection-token';

function safeJsonParse(x) {
  try {
    return JSON.parse(String(x || '').trim());
  } catch {
    return null;
  }
}

export default function StripeTerminalRoot({children}) {
  const tokenProvider = useCallback(async () => {
    try {
      const jwt = await readAgpayAuthToken(); // expects string token or null

      const resp = await fetch(CONNECTION_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? {Authorization: jwt} : {}),
        },
        body: JSON.stringify({}),
      });

      const text = await resp.text();
      console.log('🔑 connection-token =>', resp.status, text);

      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`);

      let outer = safeJsonParse(text);
      if (!outer) throw new Error('Token endpoint returned non-JSON');

      let data = outer;
      if (outer?.body && typeof outer.body === 'string') {
        const inner = safeJsonParse(outer.body);
        if (!inner) throw new Error('outer.body not JSON');
        data = inner;
      } else if (outer?.body && typeof outer.body === 'object') {
        data = outer.body;
      }

      const secret =
        data?.secret ||
        data?.connectionToken ||
        data?.token ||
        data?.connection_token;

      if (!secret || typeof secret !== 'string') {
        throw new Error(`Missing token secret: ${JSON.stringify(data)}`);
      }

      return secret;
    } catch (e) {
      console.log('❌ tokenProvider error:', e);
      Alert.alert('Terminal Token Error', String(e?.message || e));
      throw e;
    }
  }, []);

  return (
    <StripeTerminalProvider logLevel="verbose" tokenProvider={tokenProvider}>
      {children}
    </StripeTerminalProvider>
  );
}
