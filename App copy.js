// App.js (JS, not TSX)
import React, {useEffect, useState} from 'react';
import {View, Text, Button, Alert} from 'react-native';
import {
  StripeTerminalProvider,
  useStripeTerminal,
  TapZoneIndicator,
  DarkMode,
} from '@stripe/stripe-terminal-react-native';
import PaymentTerminal from './components/PaymentTerminal';
import {PermissionsAndroid, Platform} from 'react-native';

// 🔥 MUST be TRUE in dev mode. Stripe blocks real Tap to Pay in debug builds.
const USE_SIMULATED_READER = true;

// This is what StripeTerminalProvider will call to get a connection token
async function fetchConnectionToken() {
  try {
    const response = await fetch(
      'https://dgb44mnqc9.execute-api.us-east-2.amazonaws.com/Stripe/stripe/connection_token',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
      },
    );

    if (!response.ok) {
      console.log('Connection token HTTP error:', response.status);
      throw new Error('Failed to fetch connection token');
    }

    const data = await response.json();
    console.log('Connection token raw response:', data);

    if (typeof data.body === 'string') {
      const parsed = JSON.parse(data.body);
      console.log('Parsed inner body:', parsed);
      if (parsed.secret) {
        return parsed.secret;
      }
    }

    throw new Error('No "secret" field in connection token response');
  } catch (err) {
    console.log('fetchConnectionToken error:', err);
    throw err;
  }
}
async function requestLocationPermissionIfNeeded() {
  if (Platform.OS !== 'android') {
    return true;
  }

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
    } else {
      console.log('Location permission denied ❌');
      Alert.alert(
        'Location required',
        'Please enable location permission to use Tap to Pay.',
      );
      return false;
    }
  } catch (err) {
    console.warn('Error requesting location permission:', err);
    return false;
  }
}

function TerminalScreen() {
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
  const [tapToPaySupported, setTapToPaySupported] = useState(null);

  // 🔍 1) Check if device supports Tap to Pay
  useEffect(() => {
    const checkSupport = async () => {
      try {
        const {supported, error} = await supportsReadersOfType({
          type: 'tapToPay',
        });
        console.log('supportsReadersOfType(tapToPay):', {supported, error});
        setTapToPaySupported(supported);
      } catch (err) {
        console.log('supportsReadersOfType threw:', err);
      }
    };

    checkSupport();
  }, [supportsReadersOfType]);

  // 2️⃣ Initialize the Stripe Terminal SDK
  useEffect(() => {
    const init = async () => {
      const {error} = await initialize();
      if (error) {
        console.log('Terminal initialize error:', error);
        Alert.alert('Stripe Terminal', 'Failed to initialize Terminal');
      } else {
        console.log('Terminal initialized ✅');
        setInitialized(true);

        // Configure UI
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
      }
    };

    init();
  }, [initialize, setTapToPayUxConfiguration]);

  // 3️⃣ Discover & connect the simulated Tap to Pay reader
  const handleConnectTapToPay = async () => {
    try {
      if (!initialized) {
        Alert.alert('Stripe Terminal', 'Terminal not initialized');
        return;
      }

      // 🔑 NEW: make sure we have location permission first
      const ok = await requestLocationPermissionIfNeeded();

      if (tapToPaySupported === false) {
        Alert.alert(
          'Not Supported',
          'This device cannot act as a Tap to Pay reader.',
        );
        return;
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
        setConnecting(false);
        return;
      }

      console.log('discoveredReaders:', discoveredReaders);

      if (!discoveredReaders || discoveredReaders.length === 0) {
        Alert.alert('No readers found', 'No Tap to Pay reader found.');
        setConnecting(false);
        return;
      }

      const readerToConnect = discoveredReaders[0];
      console.log('Connecting to reader:', readerToConnect);

      const {reader, error: connectErr} = await connectReader(
        {
          reader: readerToConnect,
          locationId: readerToConnect.locationId,
        },
        'tapToPay',
      );

      if (connectErr) {
        console.log('connectReader error:', connectErr);
        Alert.alert('Connect error', connectErr.message);
        setConnecting(false);
        return;
      }

      console.log('Connected reader:', reader);
      Alert.alert('Reader connected', reader.label || 'Connected ✔️');
    } catch (err) {
      console.log('Unexpected connect error:', err);
      Alert.alert('Connect error', String(err));
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    try {
      const {error} = await disconnectReader();
      if (error) {
        console.log('disconnect error:', error);
      } else {
        Alert.alert('Disconnected', 'Reader disconnected.');
      }
    } catch (e) {
      console.log('Unexpected disconnect error:', e);
    }
  };

  return (
    <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
      <Text style={{fontSize: 20, marginBottom: 10}}>
        AGPay – Tap to Pay (Android)
      </Text>

      <Text>SDK initialized: {initialized ? '✅' : '⏳'}</Text>
      <Text>
        Tap to Pay Supported:{' '}
        {tapToPaySupported === null
          ? 'Checking…'
          : tapToPaySupported
          ? '✅'
          : '❌'}
      </Text>

      <Text style={{marginBottom: 20}}>
        Reader:{' '}
        {connectedReader
          ? connectedReader.label || 'Connected'
          : 'Not connected'}
      </Text>

      <Button
        title={connecting ? 'Connecting…' : 'Connect Tap to Pay (Simulated)'}
        onPress={handleConnectTapToPay}
        disabled={connecting || !initialized}
      />

      {connectedReader && (
        <View style={{marginTop: 20}}>
          <Button
            title="Disconnect reader"
            color="#a00"
            onPress={handleDisconnect}
          />
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <StripeTerminalProvider
      tokenProvider={fetchConnectionToken}
      logLevel="verbose">
      <TerminalScreen />
      <PaymentTerminal amount={1000} />
    </StripeTerminalProvider>
  );
}
