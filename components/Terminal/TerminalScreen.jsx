// C:\vscode\AG\AGPay-Sand\components\Terminal\TerminalScreen.js

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

/**
 * INVESTOR DEMO MODE
 */
const FORCE_SIMULATED_READER = true;

// Only used when FORCE_SIMULATED_READER = false
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
    await Keychain.resetInternetCredentials('agpaySelection');
    console.log('✅ Cleared agpaySelection');
  } catch (e) {
    console.log('clearAgpaySelection error:', e);
  }
}

export default function TerminalScreen({
  paymentNote,
  setPaymentNote,
  onLogout,
  onChangeStoreRequested,
  onPaymentSuccess, // App.js routes to receipt
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

    // force which simulated test card is used (prevents chip+PIN simulated flows)
    setSimulatedCard,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: readers =>
      console.log('onUpdateDiscoveredReaders:', readers),
  });

  const [initialized, setInitialized] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tapToPaySupported, setTapToPaySupported] = useState(null);

  // ✅ Start at 0.00 so after charge we can reset to the same value
  const [subtotalInput, setSubtotalInput] = useState('0.00');

  const latestReadersRef = useRef([]);

  const USE_SIMULATED_READER = !!FORCE_SIMULATED_READER;

  useEffect(() => {
    console.log(
      '✅ RUNNING TerminalScreen:',
      'components/Terminal/TerminalScreen.js',
    );
    console.log('AGPay build flags:', {
      FORCE_SIMULATED_READER,
      USE_SIMULATED_READER,
      LIVE_LOCATION_ID_used_only_if_real: LIVE_LOCATION_ID,
    });
  }, []);

  // Init
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

  // Support check
  useEffect(() => {
    if (!initialized) return;
    supportsReadersOfType({deviceType: 'tapToPay', discoveryMethod: 'tapToPay'})
      .then(r => setTapToPaySupported(r?.supported ?? null))
      .catch(e => {
        console.log('supportsReadersOfType error:', e);
        setTapToPaySupported(null);
      });
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

    const stripeFeeCents =
      Math.round(subtotalCents * stripeFeeRate) + stripeFeeFixedCents;

    const agFeeBase = Math.round(
      agFeeMinCents + subtotalCents * agFeeSlopeRate,
    );
    const agFeeCents = Math.min(
      agFeeMaxCents,
      Math.max(agFeeMinCents, agFeeBase),
    );

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

  // ✅ HARD BLOCK: do not allow $0.00 charges
  const canCharge = calc.totalCents > 0;

  const handleConnectTapToPay = async () => {
    if (!initialized) return;

    const ok = await requestLocationPermissionIfNeeded();
    if (!ok) return;

    if (tapToPaySupported === false && !USE_SIMULATED_READER) {
      Alert.alert('Not supported', 'This device does not support Tap to Pay.');
      return;
    }

    setConnecting(true);

    console.log('AGPay DISCOVER starting:', {
      discoveryMethod: 'tapToPay',
      simulated: USE_SIMULATED_READER,
    });

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
      Alert.alert(
        'Missing location ID',
        USE_SIMULATED_READER
          ? 'Simulated reader returned no locationId.'
          : 'LIVE_LOCATION_ID is not set.',
      );
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

    if (connectErr) {
      console.log('connectReader error:', connectErr);
      Alert.alert('Connect error', connectErr.message);
      setConnecting(false);
      return;
    }

    console.log('✅ Reader connected');

    // Force a standard simulated card that does NOT require chip+PIN
    if (USE_SIMULATED_READER && typeof setSimulatedCard === 'function') {
      try {
        console.log('Setting simulated card => 4242...');
        const {error: simErr} = await setSimulatedCard('4242424242424242');
        if (simErr) {
          console.log('setSimulatedCard error:', simErr);
        } else {
          console.log('✅ Simulated card set to 4242424242424242');
        }
      } catch (e) {
        console.log('setSimulatedCard exception:', e);
      }
    }

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

  // Called by PaymentTerminal after charge success
  const handleChargeSuccessFromPaymentTerminal = chargeResult => {
    console.log(
      '✅ Charge success received from PaymentTerminal:',
      chargeResult,
    );

    const receiptPayload = {
      amountText: totalLabel,
      amountCents: calc.totalCents,
      currency: AGPAY_CONFIG.currency || 'usd',
      paymentNote: paymentNote || '',
      createdAtText: new Date().toLocaleString(),
      paymentId: chargeResult?.paymentId || chargeResult?.id || null,
      chargeId: chargeResult?.chargeId || null,
      last4: chargeResult?.last4 || null,
      brand: chargeResult?.brand || null,
    };

    // ✅ RESET TERMINAL INPUTS FOR NEXT CUSTOMER
    setSubtotalInput('0.00');

    // Optional but recommended for cashier flow:
    // clear previous note so it doesn't carry over to next transaction
    if (typeof setPaymentNote === 'function') setPaymentNote('');

    if (typeof onPaymentSuccess === 'function') {
      onPaymentSuccess(receiptPayload);
    } else {
      console.log('onPaymentSuccess not provided; staying on terminal.');
    }
  };

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

      {/* What to charge */}
      <View style={s.card}>
        <Text style={s.cardTitle}>What to charge</Text>

        <View style={s.chargeRow}>
          <Text style={s.dollar}>$</Text>
          <TextInput
            style={s.amountInput}
            keyboardType="numeric"
            value={subtotalInput}
            onChangeText={setSubtotalInput}
            placeholder="0.00"
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

          {!canCharge && (
            <Text style={[s.statusText, {marginTop: 10, color: AG.danger}]}>
              Enter an amount greater than $0.00 to charge.
            </Text>
          )}
        </View>
      </View>

      {/* Reader status */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Reader status</Text>

        <Text style={s.statusText}>
          SDK: {initialized ? 'Ready' : 'Initializing'}
        </Text>
        <Text style={s.statusText}>
          Tap to Pay:{' '}
          {USE_SIMULATED_READER ? '🧪 Simulated (demo)' : supportLabel}
        </Text>
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
          // ✅ HARD GATE: do not allow charge if total is 0 (still also enforced in PaymentTerminal)
          disabled={!canCharge}
          onPaymentSuccess={handleChargeSuccessFromPaymentTerminal}
        />
      </View>
    </ScrollView>
  );
}
