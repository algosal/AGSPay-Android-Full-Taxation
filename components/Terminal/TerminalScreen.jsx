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

// ✅ Your LIVE Location ID (must be a LIVE Terminal Location in Stripe Dashboard)
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

export default function TerminalScreen({
  paymentNote,
  setPaymentNote,
  onLogout,
  onChangeStoreRequested,
  onGoToTip, // ✅ required
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

  const rawAmountEntered = String(subtotalInput ?? '').trim();
  const subtotalNumber = parseMoney(subtotalInput);
  const hasValidAmount = rawAmountEntered.length > 0 && subtotalNumber > 0;

  const supportLabel =
    tapToPaySupported === null
      ? 'Unknown'
      : tapToPaySupported
      ? '✅ Supported'
      : '❌ Not supported';

  const baseTotalLabel = `$${dollarsFromCents(calc.totalCents)}`;
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

      console.log('➡️ chosen reader:', chosen);

      if (!USE_SIMULATED_READER && chosen?.simulated) {
        Alert.alert(
          'Still simulated',
          'The SDK is still returning only simulated readers. This is usually a Stripe/Terminal configuration issue (live Location / Tap to Pay enablement).',
        );
        return;
      }

      const locationIdToUse = USE_SIMULATED_READER
        ? chosen.locationId
        : LIVE_LOCATION_ID;

      console.log('➡️ connectReader locationIdToUse:', locationIdToUse);

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
            onChangeStoreRequested?.();
          },
        },
      ],
    );
  };

  const alertAmountMissing = () => {
    Alert.alert(
      'Enter amount',
      'No amount was entered. Please enter an amount.',
    );
  };

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

    // IMPORTANT: baseAmountCents must be *subtotal*, not total.
    // Tip screen should add tip, then checkout should add tax/fees based on subtotal.
    onGoToTip({
      baseAmountCents: calc.subtotalCents,
      baseAmountLabel: `$${dollarsFromCents(calc.subtotalCents)}`,
      currency: AGPAY_CONFIG.currency || 'usd',
      paymentNote: paymentNote || '',
      // pass breakdown forward so Checkout can show/print exact values
      taxCents: calc.taxCents,
      stripeFeeCents: calc.stripeFeeCents,
      agFeeCents: calc.agFeeCents,
      totalCents: calc.totalCents,
      totalLabel: baseTotalLabel,
    });
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <Text style={[s.title, {fontSize: 22}]}>
          <Text style={{color: AG.gold}}>AG</Text>
          <Text style={{color: AG.text}}>Pay · Tap to Pay</Text>
        </Text>

        <View style={{flexDirection: 'row', gap: 10}}>
          <TouchableOpacity
            onPress={connectedReader ? handleDisconnect : handleConnectTapToPay}
            disabled={connectDisabled}
            style={[s.logoutBtn, connectDisabled && {opacity: 0.6}]}>
            <Text style={s.logoutIcon}>
              {connectedReader ? '🔌' : connecting ? '⏳' : '📶'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleChangeStore} style={s.logoutBtn}>
            <Text style={s.logoutIcon}>🏪</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
            <Text style={s.logoutIcon}>⎋</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[s.subtitle, {fontSize: 15}]}>
        Quick, simple in-person payments
      </Text>

      <View style={s.card}>
        <Text style={[s.cardTitle, {fontSize: 18}]}>What to charge</Text>

        <View style={s.chargeRow}>
          <Text style={[s.dollar, {fontSize: 26}]}>$</Text>
          <TextInput
            style={[s.amountInput, {fontSize: 24}]}
            keyboardType="numeric"
            value={subtotalInput}
            onChangeText={setSubtotalInput}
            placeholder="Enter amount"
            placeholderTextColor={AG.muted}
          />
        </View>

        <View style={s.dividerTop}>
          <View style={s.row}>
            <Text style={[s.rowLabel, {fontSize: 14}]}>Subtotal</Text>
            <Text style={[s.rowValue, {fontSize: 14}]}>
              ${dollarsFromCents(calc.subtotalCents)}
            </Text>
          </View>

          <View style={s.row}>
            <Text style={[s.rowLabel, {fontSize: 14}]}>
              Tax ({(calc.taxRate * 100).toFixed(3)}%)
            </Text>
            <Text style={[s.rowValue, {fontSize: 14}]}>
              ${dollarsFromCents(calc.taxCents)}
            </Text>
          </View>

          <View style={s.row}>
            <Text style={[s.rowLabel, {fontSize: 14}]}>Stripe Fee</Text>
            <Text style={[s.rowValue, {fontSize: 14}]}>
              ${dollarsFromCents(calc.stripeFeeCents)}
            </Text>
          </View>

          <View style={s.row}>
            <Text style={[s.rowLabel, {fontSize: 14}]}>Alba Fee</Text>
            <Text style={[s.rowValue, {fontSize: 14}]}>
              ${dollarsFromCents(calc.agFeeCents)}
            </Text>
          </View>

          <View style={s.row}>
            <Text style={[s.rowLabel, {fontSize: 14}]}>Total Fees</Text>
            <Text style={[s.rowValue, {fontSize: 14}]}>
              ${dollarsFromCents(calc.feeCents)}
            </Text>
          </View>

          <View style={[s.row, {marginTop: 12, alignItems: 'flex-end'}]}>
            <Text style={[s.rowLabel, {fontWeight: '900', fontSize: 16}]}>
              Base total
            </Text>
            <Text style={[s.rowValueGold, {fontSize: 28, fontWeight: '900'}]}>
              {baseTotalLabel}
            </Text>
          </View>

          {!hasValidAmount && (
            <Text style={[s.statusText, {marginTop: 10, color: AG.danger}]}>
              Enter an amount greater than $0.00 to continue.
            </Text>
          )}
        </View>
      </View>

      <View style={s.card}>
        <Text style={[s.cardTitle, {fontSize: 18}]}>Reader status</Text>

        <Text style={[s.statusText, {fontSize: 14}]}>
          SDK: {initialized ? 'Ready' : 'Initializing'}
        </Text>
        <Text style={[s.statusText, {fontSize: 14}]}>
          Tap to Pay:{' '}
          {USE_SIMULATED_READER ? '🧪 Simulated (demo)' : supportLabel}
        </Text>
        <Text style={[s.statusText, {fontSize: 14}]}>
          Reader:{' '}
          {connectedReader
            ? connectedReader.label || 'Connected'
            : 'Not connected'}
        </Text>
      </View>

      <View style={s.card}>
        <Text style={[s.cardTitle, {fontSize: 18}]}>Notes</Text>

        <TextInput
          style={[s.noteInput, {fontSize: 16}]}
          placeholder="e.g. Chicken over rice + soda"
          placeholderTextColor={AG.muted}
          value={paymentNote}
          onChangeText={setPaymentNote}
        />

        <TouchableOpacity
          onPress={handleGoTip}
          style={[
            s.primaryBtn,
            {
              marginTop: 12,
              backgroundColor: AG.gold,
              opacity: hasValidAmount ? 1 : 0.65,
            },
          ]}>
          <Text style={[s.primaryBtnText, {color: AG.goldText, fontSize: 16}]}>
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
