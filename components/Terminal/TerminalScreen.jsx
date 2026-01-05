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

import PaymentTerminal from '../PaymentTerminal';
import terminalStyles, {AG} from './terminal.styles';
import {AGPAY_CONFIG} from './agpay.config';

const USE_SIMULATED_READER = __DEV__;
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
    Alert.alert(
      'Permission required',
      'Location permission is required for Tap to Pay.',
    );
    return false;
  }
  return true;
}

function parseMoney(text) {
  const n = parseFloat(String(text || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
const centsFromDollars = d => Math.round(d * 100);
const dollarsFromCents = c => (c / 100).toFixed(2);

async function clearAgpaySelection() {
  try {
    const res = await Keychain.resetInternetCredentials({
      server: 'agpaySelection',
    });
    console.log('ChangeStore resetInternetCredentials(agpaySelection) =>', res);
  } catch (e) {
    console.log('clearAgpaySelection error:', e);
  }
}

export default function TerminalScreen({
  paymentNote,
  setPaymentNote,
  onLogout,
  onChangeStoreRequested, // OPTIONAL: App.js can pass this later
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
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: readers =>
      console.log('onUpdateDiscoveredReaders:', readers),
  });

  const [initialized, setInitialized] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tapToPaySupported, setTapToPaySupported] = useState(null);

  const [subtotalInput, setSubtotalInput] = useState('10.00');

  const latestReadersRef = useRef([]);

  useEffect(() => {
    console.log(
      '✅ RUNNING TerminalScreen:',
      'components/Terminal/TerminalScreen.js',
    );
  }, []);

  // Init
  useEffect(() => {
    (async () => {
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
        colors: {primary: AG.gold, error: AG.danger},
      });
    })();
  }, [initialize, setTapToPayUxConfiguration]);

  // Support check
  useEffect(() => {
    if (!initialized) return;
    supportsReadersOfType({deviceType: 'tapToPay', discoveryMethod: 'tapToPay'})
      .then(r => setTapToPaySupported(r?.supported ?? null))
      .catch(() => setTapToPaySupported(null));
  }, [initialized, supportsReadersOfType]);

  // Keep freshest readers
  useEffect(() => {
    if (Array.isArray(discoveredReaders))
      latestReadersRef.current = discoveredReaders;
  }, [discoveredReaders]);

  // Calc
  const calc = useMemo(() => {
    const subtotal = parseMoney(subtotalInput);
    const subtotalCents = centsFromDollars(subtotal);

    const taxRate = Number(AGPAY_CONFIG.taxRate || 0);

    const stripeFeeRate = Number(AGPAY_CONFIG.stripeFeeRate || 0);
    const stripeFeeFixedCents = Number(AGPAY_CONFIG.stripeFeeFixedCents || 0);

    const agFeeMinCents = Number(AGPAY_CONFIG.agFeeMinCents ?? 0);
    const agFeeMaxCents = Number(AGPAY_CONFIG.agFeeMaxCents ?? 0);
    const agFeeSlopeRate = Number(AGPAY_CONFIG.agFeeSlopeRate ?? 0);

    const taxCents = Math.round(subtotalCents * taxRate);

    // Stripe baseline fee
    const stripeFeeCents =
      Math.round(subtotalCents * stripeFeeRate) + stripeFeeFixedCents;

    // AGPay ramp fee (smooth, capped)
    const agFeeBase = Math.round(
      agFeeMinCents + subtotalCents * agFeeSlopeRate,
    );
    const agFeeCents = Math.min(
      agFeeMaxCents,
      Math.max(agFeeMinCents, agFeeBase),
    );

    // Total fee + total charge
    const feeCents = stripeFeeCents + agFeeCents;
    const totalCents = subtotalCents + taxCents + feeCents;

    return {
      subtotalCents,
      taxRate,
      taxCents,
      stripeFeeCents,
      agFeeCents,
      feeCents,
      totalCents,
    };
  }, [subtotalInput]);

  useEffect(() => {
    console.log('AGPay CALC:', {
      subtotalInput,
      subtotalCents: calc.subtotalCents,
      taxRate: calc.taxRate,
      taxCents: calc.taxCents,
      serviceFeeCents: calc.feeCents,
      totalCents: calc.totalCents,
      totalDollars: dollarsFromCents(calc.totalCents),
    });
  }, [calc, subtotalInput]);

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

    console.log('AGPay CONNECT:', {
      simulated: USE_SIMULATED_READER,
      reader,
      locationIdToUse,
    });

    const {error: connectErr} = await connectReader(
      {reader, locationId: locationIdToUse},
      'tapToPay',
    );
    if (connectErr) Alert.alert('Connect error', connectErr.message);

    setConnecting(false);
  };

  const handleDisconnect = async () => {
    console.log('AGPay DISCONNECT requested');
    await disconnectReader();
  };

  const handleChangeStore = async () => {
    Alert.alert(
      'Change store',
      'This will require selecting corporate + store again.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            await clearAgpaySelection();

            // If App.js supplies this callback, we can force a clean route immediately.
            // Otherwise App.js will still route correctly on next boot/login cycle.
            if (typeof onChangeStoreRequested === 'function') {
              onChangeStoreRequested();
            } else {
              console.log(
                'ChangeStore: onChangeStoreRequested not provided; selection cleared.',
              );
            }
          },
        },
      ],
    );
  };

  const supportLabel =
    tapToPaySupported === null
      ? 'Unknown'
      : tapToPaySupported
      ? '✅ Supported'
      : '❌ Not supported';

  const totalLabel = `$${dollarsFromCents(calc.totalCents)}`;
  const connectDisabled = connecting || !initialized;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={s.title}>
          <Text style={{color: AG.gold}}>AG</Text>
          <Text style={{color: AG.text}}>Pay · Tap to Pay</Text>
        </Text>

        <View style={{flexDirection: 'row', gap: 10}}>
          <TouchableOpacity onPress={handleChangeStore} style={s.logoutBtn}>
            <Text style={s.logoutIcon}>🏪</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
            <Text style={s.logoutIcon}>⎋</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={s.subtitle}>Quick, simple in-person payments</Text>

      {/* What to charge (top) */}
      <View style={s.card}>
        <Text style={s.cardTitle}>What to charge</Text>

        <View style={s.chargeRow}>
          <Text style={s.dollar}>$</Text>
          <TextInput
            style={s.amountInput}
            keyboardType="numeric"
            value={subtotalInput}
            onChangeText={setSubtotalInput}
            placeholder="10.00"
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
            <Text style={s.rowLabel}>AGPay fee</Text>
            <Text style={s.rowValue}>${dollarsFromCents(calc.feeCents)}</Text>
          </View>

          <View style={[s.row, {marginTop: 10}]}>
            <Text style={[s.rowLabel, {fontWeight: '900'}]}>Total</Text>
            <Text style={s.rowValueGold}>{totalLabel}</Text>
          </View>
        </View>
      </View>

      {/* Reader status */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Reader status</Text>

        <Text style={s.statusText}>
          SDK: {initialized ? 'Ready' : 'Initializing'}
        </Text>
        <Text style={s.statusText}>Tap to Pay: {supportLabel}</Text>
        <Text style={s.statusText}>
          Reader:{' '}
          {connectedReader
            ? connectedReader.label || 'Connected'
            : 'Not connected'}
        </Text>

        <TouchableOpacity
          style={[s.primaryBtn, connectDisabled && s.primaryBtnDisabled]}
          onPress={handleConnectTapToPay}
          disabled={connectDisabled}>
          <Text
            style={[
              s.primaryBtnText,
              connectDisabled && s.primaryBtnTextDisabled,
            ]}>
            {connecting ? 'Connecting…' : 'Connect Tap to Pay'}
          </Text>
        </TouchableOpacity>

        {connectedReader && (
          <TouchableOpacity style={s.secondaryBtn} onPress={handleDisconnect}>
            <Text style={s.secondaryBtnText}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notes + Charge */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Notes</Text>

        <TextInput
          style={s.noteInput}
          placeholder="e.g. Chicken over rice + soda"
          placeholderTextColor={AG.muted}
          value={paymentNote}
          onChangeText={setPaymentNote}
        />

        <PaymentTerminal
          amountCents={calc.totalCents}
          amountLabel={totalLabel}
          currency={AGPAY_CONFIG.currency || 'usd'}
          debugMeta={{
            subtotalInput,
            subtotalCents: calc.subtotalCents,
            taxRate: calc.taxRate,
            taxCents: calc.taxCents,
            serviceFeeCents: calc.feeCents,
            note: paymentNote,
          }}
          theme={{
            primary: AG.gold,
            primaryText: AG.goldText,
            text: AG.text,
            subtext: AG.subtext,
            muted: AG.muted,
            border: AG.border,
            inputBg: AG.inputBg,
            danger: AG.danger,
            disabledBg: AG.disabledBg,
            disabledText: AG.disabledText,
          }}
        />
      </View>
    </ScrollView>
  );
}
