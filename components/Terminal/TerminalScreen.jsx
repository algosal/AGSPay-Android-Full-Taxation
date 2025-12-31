import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Alert,
  TextInput,
  ScrollView,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
} from 'react-native';

import {
  useStripeTerminal,
  TapZoneIndicator,
  DarkMode,
} from '@stripe/stripe-terminal-react-native';

import PaymentTerminal from '../PaymentTerminal';

/**
 * CONFIG
 */
const USE_SIMULATED_READER = __DEV__;
const LIVE_LOCATION_ID = 'tml_GUcKvwB8ozD1jO';

// Location permission (kept here so this screen is self-contained)
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

export default function TerminalScreen({
  paymentNote,
  setPaymentNote,
  onLogout,
}) {
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

  const latestReadersRef = useRef([]);

  useEffect(() => {
    console.log(
      '✅ RUNNING TerminalScreen from components/Terminal/TerminalScreen.js',
    );
  }, []);

  // ---------------- INIT ----------------
  useEffect(() => {
    const init = async () => {
      const {error} = await initialize();
      if (error) {
        Alert.alert('Stripe Terminal', 'Failed to initialize Terminal');
        return;
      }

      setInitialized(true);

      await setTapToPayUxConfiguration({
        tapZone: {
          tapZoneIndicator: TapZoneIndicator.FRONT,
          tapZonePosition: {xBias: 0.5, yBias: 0.3},
        },
        darkMode: DarkMode.DARK,
        colors: {
          primary: '#facc15',
          error: '#ef4444',
        },
      });
    };

    init();
  }, [initialize, setTapToPayUxConfiguration]);

  // ---------------- SUPPORT CHECK ----------------
  useEffect(() => {
    if (!initialized) return;

    supportsReadersOfType({
      deviceType: 'tapToPay',
      discoveryMethod: 'tapToPay',
    })
      .then(r => setTapToPaySupported(r?.supported ?? null))
      .catch(() => setTapToPaySupported(null));
  }, [initialized, supportsReadersOfType]);

  // Keep freshest readers
  useEffect(() => {
    if (Array.isArray(discoveredReaders)) {
      latestReadersRef.current = discoveredReaders;
    }
  }, [discoveredReaders]);

  // ---------------- CONNECT ----------------
  const handleConnectTapToPay = async () => {
    if (!initialized) return;

    const ok = await requestLocationPermissionIfNeeded();
    if (!ok) return;

    if (tapToPaySupported === false && !USE_SIMULATED_READER) {
      Alert.alert('Not supported', 'This device does not support Tap to Pay.');
      return;
    }

    setConnecting(true);

    const {error} = await discoverReaders({
      discoveryMethod: 'tapToPay',
      simulated: USE_SIMULATED_READER,
    });

    if (error) {
      Alert.alert('Discover error', error.message);
      setConnecting(false);
      return;
    }

    const reader = latestReadersRef.current[0];
    if (!reader) {
      Alert.alert('No reader found');
      setConnecting(false);
      return;
    }

    const locationIdToUse = USE_SIMULATED_READER
      ? reader.locationId
      : LIVE_LOCATION_ID;

    if (!locationIdToUse) {
      Alert.alert('Missing location ID');
      setConnecting(false);
      return;
    }

    const {error: connectErr} = await connectReader(
      {reader, locationId: locationIdToUse},
      'tapToPay',
    );

    if (connectErr) {
      Alert.alert('Connect error', connectErr.message);
    }

    setConnecting(false);
  };

  const handleDisconnect = async () => {
    await disconnectReader();
  };

  const supportLabel =
    tapToPaySupported === null
      ? 'Unknown'
      : tapToPaySupported
      ? '✅ Supported'
      : '❌ Not supported';

  // ---------------- UI ----------------
  return (
    <ScrollView
      style={{flex: 1, backgroundColor: '#000'}}
      contentContainerStyle={{padding: 16, paddingBottom: 40}}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}>
        <Text style={{color: '#fff', fontSize: 20, fontWeight: '800'}}>
          AGPay · Tap to Pay
        </Text>

        <TouchableOpacity
          onPress={onLogout}
          style={{
            padding: 8,
            borderRadius: 20,
            backgroundColor: '#020617',
            borderWidth: 1,
            borderColor: '#3f3f46',
          }}>
          <Text style={{color: '#facc15', fontSize: 18, fontWeight: '700'}}>
            ⎋
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={{color: '#9ca3af', marginBottom: 12}}>
        Quick, simple in-person payments
      </Text>

      {/* Reader Status */}
      <View
        style={{
          backgroundColor: '#0b1220',
          borderWidth: 1,
          borderColor: '#1f2937',
          borderRadius: 16,
          padding: 14,
          marginBottom: 14,
        }}>
        <Text style={{color: '#fff', fontSize: 16, fontWeight: '800'}}>
          Reader status
        </Text>

        <Text style={{color: '#d1d5db', marginTop: 10}}>
          SDK: {initialized ? 'Ready' : 'Initializing'}
        </Text>

        <Text style={{color: '#d1d5db', marginTop: 6}}>
          Tap to Pay: {supportLabel}
        </Text>

        <Text style={{color: '#d1d5db', marginTop: 6}}>
          Reader:{' '}
          {connectedReader
            ? connectedReader.label || 'Connected'
            : 'Not connected'}
        </Text>

        <TouchableOpacity
          style={{
            backgroundColor: connecting || !initialized ? '#374151' : '#facc15',
            paddingVertical: 14,
            borderRadius: 12,
            marginTop: 12,
          }}
          onPress={handleConnectTapToPay}
          disabled={connecting || !initialized}>
          <Text
            style={{
              color: connecting || !initialized ? '#9ca3af' : '#020617',
              fontSize: 15,
              fontWeight: '800',
              textAlign: 'center',
            }}>
            {connecting ? 'Connecting…' : 'Connect Tap to Pay'}
          </Text>
        </TouchableOpacity>

        {connectedReader && (
          <TouchableOpacity
            style={{
              marginTop: 10,
              paddingVertical: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#ef4444',
            }}
            onPress={handleDisconnect}>
            <Text
              style={{
                color: '#ef4444',
                fontSize: 14,
                fontWeight: '700',
                textAlign: 'center',
              }}>
              Disconnect
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Payment */}
      <View
        style={{
          backgroundColor: '#0b1220',
          borderWidth: 1,
          borderColor: '#1f2937',
          borderRadius: 16,
          padding: 14,
        }}>
        <Text style={{color: '#fff', fontSize: 16, fontWeight: '800'}}>
          Payment details
        </Text>

        <TextInput
          style={{
            marginTop: 10,
            borderWidth: 1,
            borderColor: '#374151',
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: '#fff',
            backgroundColor: '#020617',
          }}
          placeholder="e.g. Chicken over rice + soda"
          placeholderTextColor="#9ca3af"
          value={paymentNote}
          onChangeText={setPaymentNote}
        />

        <PaymentTerminal
          defaultAmount={20}
          theme={{
            primary: '#facc15',
            primaryText: '#020617',
            text: '#ffffff',
            subtext: '#d1d5db',
            muted: '#9ca3af',
            border: '#374151',
            inputBg: '#020617',
            danger: '#ef4444',
          }}
        />
      </View>
    </ScrollView>
  );
}
