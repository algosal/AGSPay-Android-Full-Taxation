// components/Terminal/TerminalScreen.jsx
import React, {useEffect, useMemo, useRef, useState} from 'react';
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

import * as Keychain from 'react-native-keychain';

import terminalStyles, {AG} from './terminal.styles';
import {AGPAY_CONFIG} from './agpay.config';

// ✅ LIVE MODE: set this to false
const FORCE_SIMULATED_READER = false;

// ✅ Your LIVE Location ID
const LIVE_LOCATION_ID = 'tml_GUcKvwB8ozD1jO';

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
    Alert.alert('Permission required', 'Location permission is required.');
    return false;
  }
  return true;
}

function parseMoney(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return 0;
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const centsFromDollars = d => Math.round(d * 100);
const dollarsFromCents = c => (c / 100).toFixed(2);

async function clearAgpaySelection() {
  try {
    await Keychain.resetInternetCredentials('agpaySelection');
    console.log('✅ Cleared agpaySelection');
  } catch (e) {
    console.log('clearAgpaySelection error:', e);
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export default function TerminalScreen({
  paymentNote,
  setPaymentNote,
  onLogout, // kept for compatibility (not used here)
  onChangeStoreRequested, // kept for compatibility (not used here)
  onGoToTip,
}) {
  const s = terminalStyles;

  const {
    initialize,
    discoverReaders,
    connectReader,
    disconnectReader,
    connectedReader,
    discoveredReaders,
    setTapToPayUxConfiguration,
    supportsReadersOfType,
    setSimulatedCard,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: readers => {
      console.log('onUpdateDiscoveredReaders:', readers);
    },
  });

  const [initialized, setInitialized] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tapToPaySupported, setTapToPaySupported] = useState(null);

  const [subtotalInput, setSubtotalInput] = useState('');

  const latestReadersRef = useRef([]);
  const USE_SIMULATED_READER = !!FORCE_SIMULATED_READER;

  useEffect(() => {
    console.log(
      '✅ RUNNING TerminalScreen: components/Terminal/TerminalScreen.jsx',
    );
    console.log('FORCE_SIMULATED_READER:', FORCE_SIMULATED_READER);
    console.log('LIVE_LOCATION_ID:', LIVE_LOCATION_ID);
  }, []);

  useEffect(() => {
    (async () => {
      const {error} = await initialize();
      if (error) {
        console.log('Stripe Terminal initialize error:', error);
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
        colors: {primary: AG.gold, error: AG.danger},
      });
    })();
  }, [initialize, setTapToPayUxConfiguration]);

  useEffect(() => {
    if (!initialized) return;

    supportsReadersOfType({deviceType: 'tapToPay', discoveryMethod: 'tapToPay'})
      .then(r => setTapToPaySupported(r?.supported ?? null))
      .catch(e => {
        console.log('supportsReadersOfType error:', e);
        setTapToPaySupported(null);
      });
  }, [initialized, supportsReadersOfType]);

  useEffect(() => {
    if (Array.isArray(discoveredReaders)) {
      latestReadersRef.current = discoveredReaders;
    }
  }, [discoveredReaders]);

  // ✅ Compute tax + alba fee from SUBTOTAL
  const calc = useMemo(() => {
    const subtotalDollars = parseMoney(subtotalInput);
    const subtotalCents = centsFromDollars(subtotalDollars);

    const taxRate = Number(AGPAY_CONFIG.taxRate || 0);

    const stripeFeeRate = Number(AGPAY_CONFIG.stripeFeeRate || 0);
    const stripeFeeFixedCents = Number(AGPAY_CONFIG.stripeFeeFixedCents || 0);

    const agFeeMinCents = Number(AGPAY_CONFIG.agFeeMinCents ?? 0);
    const agFeeMaxCents = Number(AGPAY_CONFIG.agFeeMaxCents ?? 0);
    const agFeeSlopeRate = Number(AGPAY_CONFIG.agFeeSlopeRate ?? 0);

    const taxCents = Math.round(subtotalCents * taxRate);

    const stripeFeeCents =
      Math.round(subtotalCents * stripeFeeRate) + stripeFeeFixedCents;

    const agFeeBase = Math.round(
      agFeeMinCents + subtotalCents * agFeeSlopeRate,
    );
    const agFeeCents = clamp(agFeeBase, agFeeMinCents, agFeeMaxCents);

    const albaFeeCents = stripeFeeCents + agFeeCents;

    const baseTotalCents = subtotalCents + taxCents + albaFeeCents;

    return {
      subtotalCents,
      taxRate,
      taxCents,
      stripeFeeCents,
      agFeeCents,
      albaFeeCents,
      baseTotalCents,
    };
  }, [subtotalInput]);

  const rawAmountEntered = String(subtotalInput ?? '').trim();
  const subtotalNumber = parseMoney(subtotalInput);
  const hasValidAmount = rawAmountEntered.length > 0 && subtotalNumber > 0;

  const supportLabel =
    tapToPaySupported === null
      ? 'Unknown'
      : tapToPaySupported
      ? 'Supported'
      : 'Not supported';

  const baseTotalLabel = `$${dollarsFromCents(calc.baseTotalCents)}`;
  const connectDisabled = connecting || !initialized;

  const handleConnectTapToPay = async () => {
    if (!initialized) return;

    if (!USE_SIMULATED_READER) {
      if (!LIVE_LOCATION_ID || LIVE_LOCATION_ID === 'tml_simulated') {
        Alert.alert(
          'Live Location missing',
          'Set LIVE_LOCATION_ID to your real LIVE Terminal Location (tml_...).',
        );
        return;
      }
    }

    const ok = await requestLocationPermissionIfNeeded();
    if (!ok) return;

    if (tapToPaySupported === false && !USE_SIMULATED_READER) {
      Alert.alert('Not supported', 'This device does not support Tap to Pay.');
      return;
    }

    setConnecting(true);

    try {
      console.log(
        '🔎 discoverReaders tapToPay simulated =',
        USE_SIMULATED_READER,
      );

      const {error} = await discoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: USE_SIMULATED_READER,
      });

      if (error) {
        console.log('discoverReaders error:', error);
        Alert.alert('Discover error', error.message);
        return;
      }

      const readers = latestReadersRef.current || [];
      console.log('✅ latestReadersRef.current:', readers);

      const chosen = USE_SIMULATED_READER
        ? readers[0]
        : readers.find(r => !r?.simulated) || readers[0];

      if (!chosen) {
        Alert.alert('No reader found');
        return;
      }

      if (!USE_SIMULATED_READER && chosen?.simulated) {
        Alert.alert(
          'Still simulated',
          'The SDK is still returning only simulated readers.',
        );
        return;
      }

      const locationIdToUse = USE_SIMULATED_READER
        ? chosen.locationId
        : LIVE_LOCATION_ID;

      const {error: connectErr} = await connectReader(
        {reader: chosen, locationId: locationIdToUse},
        'tapToPay',
      );

      if (connectErr) {
        console.log('connectReader error:', connectErr);
        Alert.alert('Connect error', connectErr.message);
        return;
      }

      console.log('✅ Reader connected');

      if (USE_SIMULATED_READER && typeof setSimulatedCard === 'function') {
        await setSimulatedCard({number: '4242424242424242', type: 'credit'});
        console.log('✅ Simulated CREDIT card set (no PIN)');
      }
    } catch (e) {
      console.log('handleConnectTapToPay error:', e);
      Alert.alert('Error', String(e?.message || e));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    console.log('AGPay DISCONNECT requested');
    await disconnectReader();
  };

  const alertAmountMissing = () => {
    Alert.alert(
      'Enter amount',
      'No amount was entered. Please enter an amount.',
    );
  };

  // ✅ Go to tip with FULL breakdown (tip added after)
  const handleGoTip = async () => {
    const raw = String(subtotalInput ?? '').trim();
    const subtotal = parseMoney(subtotalInput);

    if (!raw) return alertAmountMissing();
    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than $0.00.');
      return;
    }

    if (typeof onGoToTip !== 'function') {
      Alert.alert('Missing route', 'onGoToTip is not configured.');
      return;
    }

    onGoToTip({
      currency: AGPAY_CONFIG.currency || 'usd',
      paymentNote: paymentNote || '',

      subtotalCents: calc.subtotalCents,
      taxCents: calc.taxCents,
      albaFeeCents: calc.albaFeeCents,
      stripeFeeCents: calc.stripeFeeCents,
      agFeeCents: calc.agFeeCents,

      baseTotalCents: calc.baseTotalCents,
      baseTotalLabel: `$${dollarsFromCents(calc.baseTotalCents)}`,
    });
  };

  // ✅ Top connect area UI
  const readerLabel = connectedReader
    ? connectedReader.label || 'Connected'
    : 'Not connected';

  const pill = (() => {
    if (connectedReader) {
      return {text: 'CONNECTED', bg: AG.gold, fg: AG.goldText, icon: '🔌'};
    }
    if (connecting) {
      return {text: 'CONNECTING', bg: '#334155', fg: AG.text, icon: '⏳'};
    }
    return {text: 'TAP TO CONNECT', bg: '#334155', fg: AG.text, icon: '📶'};
  })();

  const onTapConnectRow = () => {
    if (connectDisabled) return;
    if (connectedReader) handleDisconnect();
    else handleConnectTapToPay();
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <Text style={s.title}>
          <Text style={{color: AG.gold}}>AG</Text>
          <Text style={{color: AG.text}}>Pay · Tap to Pay</Text>
        </Text>

        <Text style={s.subtitle}>Quick, simple in-person payments</Text>

        {/* ✅ Tap-to-connect at TOP (not a button) */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onTapConnectRow}
          disabled={connectDisabled}
          style={[s.topConnectRow, connectDisabled && {opacity: 0.65}]}>
          <View style={s.topConnectLeft}>
            <Text style={s.topConnectIcon}>{pill.icon}</Text>
            <View style={{flex: 1}}>
              <Text style={s.topConnectTitle}>
                {connectedReader ? 'Reader Connected' : 'Connect Reader'}
              </Text>
              <Text style={s.topConnectSub}>
                {USE_SIMULATED_READER
                  ? 'Simulated demo mode'
                  : `SDK: ${
                      initialized ? 'Ready' : 'Initializing'
                    } · TapToPay: ${supportLabel}`}
                {' · '}
                {readerLabel}
              </Text>
            </View>
          </View>

          <View
            style={[
              s.topConnectPill,
              connectedReader && {backgroundColor: pill.bg},
            ]}>
            <Text
              style={[
                s.topConnectPillText,
                connectedReader && {color: pill.fg},
              ]}>
              {pill.text}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>What to charge (subtotal)</Text>

        <View style={s.chargeRow}>
          <Text style={s.dollar}>$</Text>
          <TextInput
            style={s.amountInput}
            keyboardType="numeric"
            value={subtotalInput}
            onChangeText={setSubtotalInput}
            placeholder="Enter amount"
            placeholderTextColor={AG.muted}
          />
        </View>

        <View style={s.dividerTop}>
          <View style={s.row}>
            <Text style={s.rowLabel}>Subtotal</Text>
            <Text style={s.rowValue}>
              ${dollarsFromCents(calc.subtotalCents)}
            </Text>
          </View>

          <View style={s.row}>
            <Text style={s.rowLabel}>
              Tax ({(calc.taxRate * 100).toFixed(3)}%)
            </Text>
            <Text style={s.rowValue}>${dollarsFromCents(calc.taxCents)}</Text>
          </View>

          <View style={s.row}>
            <Text style={s.rowLabel}>Alba fee</Text>
            <Text style={s.rowValue}>
              ${dollarsFromCents(calc.albaFeeCents)}
            </Text>
          </View>

          <View style={[s.row, {marginTop: 12, alignItems: 'flex-end'}]}>
            <Text style={[s.rowLabel, {fontWeight: '900', fontSize: 14}]}>
              Base total (before tip)
            </Text>
            <Text style={s.rowValueGold}>{baseTotalLabel}</Text>
          </View>

          {!hasValidAmount && (
            <Text style={[s.statusText, {marginTop: 10, color: AG.danger}]}>
              Enter an amount greater than $0.00 to continue.
            </Text>
          )}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Notes</Text>

        <TextInput
          style={s.noteInput}
          placeholder="e.g. Chicken over rice + soda"
          placeholderTextColor={AG.muted}
          value={paymentNote}
          onChangeText={setPaymentNote}
        />

        <TouchableOpacity
          onPress={handleGoTip}
          disabled={!hasValidAmount}
          style={[s.primaryBtn, {opacity: hasValidAmount ? 1 : 0.65}]}>
          <Text style={s.primaryBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
