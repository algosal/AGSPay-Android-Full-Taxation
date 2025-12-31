// components/Terminal/TerminalScreen.js

import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Alert,
  TextInput,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

import {
  useStripeTerminal,
  TapZoneIndicator,
  DarkMode,
} from '@stripe/stripe-terminal-react-native';

import PaymentTerminal from '../PaymentTerminal';
import terminalStyles from './terminal.styles';

/**
 * CONFIG
 */
const USE_SIMULATED_READER = __DEV__;
const LIVE_LOCATION_ID = 'tml_GUcKvwB8ozD1jO';

export default function TerminalScreen({
  styles, // global app styles
  paymentNote,
  setPaymentNote,
  onLogout,
  requestLocationPermissionIfNeeded,
}) {
  // 🔑 MERGE STYLES (THIS WAS THE MISSING PIECE)
  const s = {...styles, ...terminalStyles};

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
          primary: '#facc15', // AG gold
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
    <ScrollView style={s.screen} contentContainerStyle={s.screenContent}>
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={s.appTitle}>AGPay · Tap to Pay</Text>

        <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
          <Text style={s.logoutIcon}>⎋</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.appSubtitle}>Quick, simple in-person payments</Text>

      {/* Reader Status */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Reader status</Text>

        <Text style={s.statusRow}>
          SDK: {initialized ? 'Ready' : 'Initializing'}
        </Text>

        <Text style={s.statusRow}>Tap to Pay: {supportLabel}</Text>

        <Text style={s.statusRow}>
          Reader:{' '}
          {connectedReader
            ? connectedReader.label || 'Connected'
            : 'Not connected'}
        </Text>

        <TouchableOpacity
          style={[
            s.primaryBtn,
            (connecting || !initialized) && s.primaryBtnDisabled,
          ]}
          onPress={handleConnectTapToPay}
          disabled={connecting || !initialized}>
          <Text style={s.primaryBtnText}>
            {connecting ? 'Connecting…' : 'Connect Tap to Pay'}
          </Text>
        </TouchableOpacity>

        {connectedReader && (
          <TouchableOpacity style={s.secondaryBtn} onPress={handleDisconnect}>
            <Text style={s.secondaryBtnText}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Payment */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Payment details</Text>

        <TextInput
          style={s.noteInput}
          placeholder="e.g. Chicken over rice + soda"
          placeholderTextColor="#9ca3af"
          value={paymentNote}
          onChangeText={setPaymentNote}
        />

        <PaymentTerminal note={paymentNote} defaultAmount={20} />
      </View>
    </ScrollView>
  );
}
