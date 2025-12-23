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
import PaymentTerminal from './components/PaymentTerminal';

// Debug builds: simulated. Release builds: live Tap to Pay.
const USE_SIMULATED_READER = __DEV__;

// IMPORTANT (LIVE ONLY):
// Put your Stripe Terminal Location ID here (Stripe Dashboard -> Terminal -> Locations).
// It looks like: tml_12345...
// Leave it empty ONLY if you are running simulated.
const LIVE_LOCATION_ID = 'tml_GUcKvwB8ozD1jO';

// Endpoints (centralized)
const API_BASE =
  'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe';

// StripeTerminalProvider calls this to fetch a connection token
async function fetchConnectionToken() {
  try {
    const response = await fetch(`${API_BASE}/connection_token`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
    });

    if (!response.ok) {
      console.log('Connection token HTTP error:', response.status);
      const text = await response.text();
      console.log('Connection token error body:', text);
      throw new Error('Failed to fetch connection token');
    }

    const data = await response.json();
    console.log('Connection token raw response:', data);

    // Non-proxy API Gateway often wraps response in data.body
    if (typeof data.body === 'string') {
      const parsed = JSON.parse(data.body);
      console.log('Parsed inner body:', parsed);
      if (parsed.secret) return parsed.secret;
    }

    // Or direct JSON
    if (data.secret) return data.secret;

    throw new Error('No "secret" field in connection token response');
  } catch (err) {
    console.log('fetchConnectionToken error:', err);
    throw err;
  }
}

async function requestLocationPermissionIfNeeded() {
  if (Platform.OS !== 'android') return true;

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission',
        message: 'AGPay uses location to enable Tap to Pay on this device.',
        buttonPositive: 'OK',
      },
    );

    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
      console.log('Location permission granted ✅');
      return true;
    }

    console.log('Location permission denied ❌');
    Alert.alert(
      'Location required',
      'Please enable location permission to use Tap to Pay.',
    );
    return false;
  } catch (err) {
    console.warn('Error requesting location permission:', err);
    return false;
  }
}

function TerminalScreen({paymentNote, setPaymentNote}) {
  const {
    initialize,
    discoverReaders,
    connectReader,
    disconnectReader,
    connectedReader,
    discoveredReaders,
    setTapToPayUxConfiguration,
    supportsReadersOfType,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: readers => {
      console.log('onUpdateDiscoveredReaders:', readers);
    },
  });

  const [initialized, setInitialized] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // null = unknown (do not show "not supported")
  // true = supported
  // false = explicitly not supported
  const [tapToPaySupported, setTapToPaySupported] = useState(null);

  // IMPORTANT:
  // In React state, "discoveredReaders" may lag behind onUpdateDiscoveredReaders.
  // Keep the freshest list in a ref so we always connect using the latest.
  const latestReadersRef = useRef([]);

  // 1) Initialize Terminal SDK
  useEffect(() => {
    const init = async () => {
      const {error} = await initialize();
      if (error) {
        console.log('Terminal initialize error:', error);
        Alert.alert('Stripe Terminal', 'Failed to initialize Terminal');
        return;
      }

      console.log('Terminal initialized ✅');
      setInitialized(true);

      // Configure Tap to Pay UI
      try {
        const tapZone = {
          tapZoneIndicator: TapZoneIndicator.FRONT,
          tapZonePosition: {xBias: 0.5, yBias: 0.3},
        };

        const colors = {
          primary: '#FF008686',
          error: '#FFCC0000',
        };

        const config = {
          tapZone,
          darkMode: DarkMode.DARK,
          colors,
        };

        const {error: uxErr} = await setTapToPayUxConfiguration(config);
        if (uxErr) console.log('UX config error:', uxErr);
        else console.log('Tap to Pay UX config set ✅');
      } catch (err) {
        console.log('Tap to Pay UX exception:', err);
      }
    };

    init();
  }, [initialize, setTapToPayUxConfiguration]);

  // 2) Support check: treat as UNKNOWN unless boolean
  useEffect(() => {
    if (!initialized) return;

    const checkSupport = async () => {
      try {
        const result = await supportsReadersOfType({
          deviceType: 'tapToPay',
          discoveryMethod: 'tapToPay',
        });

        console.log('supportsReadersOfType(tapToPay) raw:', result);

        if (typeof result?.supported === 'boolean') {
          setTapToPaySupported(result.supported);
        } else {
          setTapToPaySupported(null);
        }
      } catch (err) {
        console.log('supportsReadersOfType threw:', err);
        setTapToPaySupported(null);
      }
    };

    checkSupport();
  }, [initialized, supportsReadersOfType]);

  // 3) Discover + connect
  const handleConnectTapToPay = async () => {
    try {
      if (!initialized) {
        Alert.alert('Stripe Terminal', 'Terminal not initialized');
        return;
      }

      const ok = await requestLocationPermissionIfNeeded();
      if (!ok) return;

      // Only hard-block in LIVE mode if explicitly false
      if (tapToPaySupported === false && !USE_SIMULATED_READER) {
        Alert.alert(
          'Not Supported',
          'This device cannot act as a Tap to Pay reader.',
        );
        return;
      }

      // LIVE requires a non-empty tml_... location id
      if (!USE_SIMULATED_READER) {
        const trimmed = (LIVE_LOCATION_ID || '').trim();
        if (!trimmed || !trimmed.startsWith('tml_')) {
          Alert.alert(
            'Missing LIVE locationId',
            'Set LIVE_LOCATION_ID to your Stripe Terminal Location (tml_...) in App.js.',
          );
          return;
        }
      }

      setConnecting(true);
      console.log('Discovering Tap to Pay… simulated =', USE_SIMULATED_READER);

      const {error} = await discoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: USE_SIMULATED_READER,
      });

      if (error) {
        console.log('discoverReaders error:', error);
        Alert.alert('Discover error', error.message);
        return;
      }

      // Prefer freshest list from ref, fallback to hook state.
      const readers =
        (latestReadersRef.current && latestReadersRef.current.length > 0
          ? latestReadersRef.current
          : discoveredReaders) || [];

      console.log('discoveredReaders (ref):', latestReadersRef.current);
      console.log('discoveredReaders (state):', discoveredReaders);
      console.log('Using readers list:', readers);

      if (!readers || readers.length === 0) {
        Alert.alert('No readers found', 'No Tap to Pay reader found.');
        return;
      }

      const readerToConnect = readers[0];
      console.log('Connecting to reader:', readerToConnect);

      // CRITICAL FIX:
      // - Simulated: use readerToConnect.locationId (tml_simulated)
      // - Live: use LIVE_LOCATION_ID (tml_...)
      const locationIdToUse = USE_SIMULATED_READER
        ? (readerToConnect.locationId || '').trim()
        : (LIVE_LOCATION_ID || '').trim();

      if (!locationIdToUse) {
        Alert.alert(
          'Connect blocked',
          'locationId resolved to empty string. Provide a valid Terminal Location ID (tml_...).',
        );
        return;
      }

      console.log('Using locationId:', locationIdToUse);

      const {reader, error: connectErr} = await connectReader(
        {
          reader: readerToConnect,
          locationId: locationIdToUse,
        },
        'tapToPay',
      );

      if (connectErr) {
        console.log('connectReader error:', connectErr);
        Alert.alert('Connect error', connectErr.message);
        return;
      }

      console.log('Connected reader:', reader);
      Alert.alert('Reader connected', reader?.label || 'Connected ✔️');
    } catch (err) {
      console.log('Unexpected connect error:', err);
      Alert.alert('Connect error', String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const {error} = await disconnectReader();
      if (error) console.log('disconnect error:', error);
      else Alert.alert('Disconnected', 'Reader disconnected.');
    } catch (e) {
      console.log('Unexpected disconnect error:', e);
    }
  };

  // Keep latest readers in ref (ensures we can connect immediately after discovery update)
  useEffect(() => {
    // This covers cases where hook updates but onUpdateDiscoveredReaders doesn't.
    if (Array.isArray(discoveredReaders)) {
      latestReadersRef.current = discoveredReaders;
    }
  }, [discoveredReaders]);

  const supportLabel =
    tapToPaySupported === null
      ? 'Unknown (validated on connect)'
      : tapToPaySupported
      ? '✅ Supported'
      : '❌ Not supported';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}>
      <Text style={styles.appTitle}>AGPay · Tap to Pay</Text>
      <Text style={styles.appSubtitle}>Quick, simple in-person payments</Text>

      {/* Reader card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reader status</Text>

        <Text style={styles.statusRow}>
          <Text style={styles.statusLabel}>SDK initialized: </Text>
          <Text style={styles.statusValue}>
            {initialized ? '✅ Ready' : '⏳ Initializing'}
          </Text>
        </Text>

        <Text style={styles.statusRow}>
          <Text style={styles.statusLabel}>Tap to Pay support: </Text>
          <Text style={styles.statusValue}>{supportLabel}</Text>
        </Text>

        <Text style={[styles.statusRow, {marginBottom: 12}]}>
          <Text style={styles.statusLabel}>Reader: </Text>
          <Text style={styles.statusValue}>
            {connectedReader
              ? connectedReader.label || 'Connected'
              : 'Not connected'}
          </Text>
        </Text>

        <View style={styles.buttonRow}>
          <View style={styles.buttonWrapper}>
            <Button
              title={
                connecting
                  ? 'Connecting…'
                  : `Connect Tap to Pay (${
                      USE_SIMULATED_READER ? 'Simulated' : 'Live'
                    })`
              }
              onPress={handleConnectTapToPay}
              disabled={connecting || !initialized}
            />
          </View>

          {connectedReader && (
            <View style={styles.buttonWrapper}>
              <Button
                title="Disconnect"
                color="#a00"
                onPress={handleDisconnect}
              />
            </View>
          )}
        </View>
      </View>

      {/* Payment details card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment details</Text>
        <Text style={styles.label}>What is this payment for?</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="e.g. Chicken over rice + soda"
          placeholderTextColor="#777"
          value={paymentNote}
          onChangeText={setPaymentNote}
        />

        <PaymentTerminal note={paymentNote} defaultAmount={20} />
      </View>
    </ScrollView>
  );
}

export default function App() {
  const [paymentNote, setPaymentNote] = useState('');

  return (
    <StripeTerminalProvider
      tokenProvider={fetchConnectionToken}
      logLevel="verbose">
      <TerminalScreen
        paymentNote={paymentNote}
        setPaymentNote={setPaymentNote}
      />
    </StripeTerminalProvider>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#050814'},
  screenContent: {padding: 16, paddingBottom: 32},
  appTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  appSubtitle: {fontSize: 13, color: '#9ca3af', marginBottom: 16},
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e5e7eb',
    marginBottom: 8,
  },
  statusRow: {fontSize: 13, color: '#d1d5db', marginVertical: 2},
  statusLabel: {fontWeight: '500'},
  statusValue: {fontWeight: '400'},
  buttonRow: {flexDirection: 'row', marginTop: 12},
  buttonWrapper: {flex: 1, marginRight: 8},
  label: {fontSize: 13, color: '#9ca3af', marginTop: 8, marginBottom: 4},
  noteInput: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#f9fafb',
    fontSize: 14,
    backgroundColor: '#020617',
    marginBottom: 12,
  },
});
