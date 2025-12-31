// App.js (JS, not TSX)
import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  Button,
  Alert,
  PermissionsAndroid,
  Platform,
  TextInput,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {
  StripeTerminalProvider,
  useStripeTerminal,
  TapZoneIndicator,
  DarkMode,
} from '@stripe/stripe-terminal-react-native';
import * as Keychain from 'react-native-keychain';

import PaymentTerminal from './components/PaymentTerminal';
import Login from './components/Login/Login';

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------

const USE_SIMULATED_READER = __DEV__;
const LIVE_LOCATION_ID = 'tml_GUcKvwB8ozD1jO';

const API_BASE =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe';

const KEYCHAIN_AUTH_SERVICE = 'agpayAuthToken';

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
// LOCATION PERMISSION
// -----------------------------------------------------------------------------

async function requestLocationPermissionIfNeeded() {
  if (Platform.OS !== 'android') return true;

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location Permission',
      message: 'AGPay uses location to enable Tap to Pay.',
      buttonPositive: 'OK',
    },
  );

  if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
    Alert.alert(
      'Permission required',
      'Location permission is required for Tap to Pay.',
    );
    return false;
  }

  return true;
}

// -----------------------------------------------------------------------------
// TERMINAL SCREEN (UNCHANGED LOGIC)
// -----------------------------------------------------------------------------

function TerminalScreen({paymentNote, setPaymentNote, onLogout}) {
  const {
    initialize,
    discoverReaders,
    connectReader,
    disconnectReader,
    connectedReader,
    discoveredReaders,
    setTapToPayUxConfiguration,
    supportsReadersOfType,
  } = useStripeTerminal();

  const [initialized, setInitialized] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tapToPaySupported, setTapToPaySupported] = useState(null);

  const latestReadersRef = useRef([]);

  useEffect(() => {
    const init = async () => {
      const {error} = await initialize();
      if (error) {
        Alert.alert('Stripe Terminal', 'Failed to initialize');
        return;
      }

      setInitialized(true);

      const config = {
        tapZone: {
          tapZoneIndicator: TapZoneIndicator.FRONT,
          tapZonePosition: {xBias: 0.5, yBias: 0.3},
        },
        darkMode: DarkMode.DARK,
        colors: {
          primary: '#FF008686',
          error: '#FFCC0000',
        },
      };

      await setTapToPayUxConfiguration(config);
    };

    init();
  }, [initialize, setTapToPayUxConfiguration]);

  useEffect(() => {
    if (!initialized) return;

    supportsReadersOfType({
      deviceType: 'tapToPay',
      discoveryMethod: 'tapToPay',
    }).then(result => {
      setTapToPaySupported(
        typeof result?.supported === 'boolean' ? result.supported : null,
      );
    });
  }, [initialized, supportsReadersOfType]);

  useEffect(() => {
    if (Array.isArray(discoveredReaders)) {
      latestReadersRef.current = discoveredReaders;
    }
  }, [discoveredReaders]);

  const handleConnectTapToPay = async () => {
    if (!(await requestLocationPermissionIfNeeded())) return;

    setConnecting(true);

    await discoverReaders({
      discoveryMethod: 'tapToPay',
      simulated: USE_SIMULATED_READER,
    });

    const readers = latestReadersRef.current;
    if (!readers.length) {
      Alert.alert('No readers found');
      setConnecting(false);
      return;
    }

    const reader = readers[0];
    const locationId = USE_SIMULATED_READER
      ? reader.locationId
      : LIVE_LOCATION_ID;

    await connectReader({reader, locationId}, 'tapToPay');
    setConnecting(false);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}>
      <Text style={styles.appTitle}>AGPay · Tap to Pay</Text>

      <View style={{marginBottom: 12}}>
        <Button title="Logout" color="#a00" onPress={onLogout} />
      </View>

      <View style={styles.card}>
        <Button
          title={
            connecting
              ? 'Connecting…'
              : `Connect (${USE_SIMULATED_READER ? 'Simulated' : 'Live'})`
          }
          onPress={handleConnectTapToPay}
          disabled={!initialized || connecting}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Payment note</Text>
        <TextInput
          style={styles.noteInput}
          value={paymentNote}
          onChangeText={setPaymentNote}
        />
        <PaymentTerminal note={paymentNote} defaultAmount={20} />
      </View>
    </ScrollView>
  );
}

// -----------------------------------------------------------------------------
// APP ROOT (LOGIN + LOGOUT WORK)
// -----------------------------------------------------------------------------

export default function App() {
  const [paymentNote, setPaymentNote] = useState('');
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    Keychain.getInternetCredentials(KEYCHAIN_AUTH_SERVICE).then(creds => {
      if (creds?.password) setAuthed(true);
    });
  }, []);

  // useEffect(() => {
  //   console.log('AUTH STATE:', authed);
  // }, [authed]);

  // const handleLogout = async () => {
  //   alert('Logged out');
  //   await Keychain.resetInternetCredentials(KEYCHAIN_AUTH_SERVICE);
  //   setAuthed(false);
  // };
  const handleLogout = async () => {
    try {
      await Keychain.resetInternetCredentials({
        service: 'agpayAuthToken',
      });

      setAuthed(false); // ⬅ THIS switches screen
      setPaymentNote(''); // optional cleanup
    } catch (e) {
      console.log('Logout error:', e);
      setAuthed(false); // still force logout UI
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

// -----------------------------------------------------------------------------
// STYLES
// -----------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#050814'},
  screenContent: {padding: 16},
  appTitle: {fontSize: 24, fontWeight: '700', color: '#fff'},
  card: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  label: {color: '#9ca3af', marginBottom: 6},
  noteInput: {
    borderWidth: 1,
    borderColor: '#374151',
    color: '#fff',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
});
