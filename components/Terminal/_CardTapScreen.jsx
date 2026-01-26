// FILE: components/Terminal/CardTapScreen.jsx
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';

const GOLD = '#d4af37';

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function CardTapScreen({
  theme,
  chargeData,
  readerStatus,
  isReaderBusy,
  onBack,
  onCancel,
  onStart,

  // ✅ optional: App.js can pass this from PaymentTerminal
  terminalStatusLine,
}) {
  const t = useMemo(
    () => ({
      bg: theme?.bg ?? '#020617',
      card: theme?.card ?? '#050814',
      text: theme?.text ?? '#ffffff',
      muted: theme?.muted ?? '#9ca3af',
      border: theme?.border ?? '#1f2937',
      gold: theme?.gold ?? GOLD,
      danger: theme?.danger ?? '#ef4444',
    }),
    [theme],
  );

  const totalCents = Number(chargeData?.totalCents || 0);
  const totalLabel =
    chargeData?.totalLabel || (totalCents ? centsToMoney(totalCents) : '$0.00');

  // ✅ UI state (we show a clean, employee-friendly status)
  const [uiLine, setUiLine] = useState('Preparing terminal…');
  const didStartRef = useRef(false);

  const connectedUi = !!readerStatus?.connected;
  const readerLabel = readerStatus?.label || '';

  // ✅ Derive a clean “what the employee should see”
  const derivedStatus = useMemo(() => {
    const s = String(terminalStatusLine || '').toLowerCase();

    if (isReaderBusy) return {title: 'Connecting…', detail: 'Please wait'};
    if (s.includes('discover'))
      return {title: 'Finding reader…', detail: 'Hold device steady'};
    if (s.includes('connect'))
      return {title: 'Connecting…', detail: 'Please wait'};
    if (s.includes('collect')) return {title: 'Ready', detail: 'Tap card now'};
    if (s.includes('confirm'))
      return {title: 'Processing…', detail: 'Do not close the app'};
    if (s.includes('succeed'))
      return {title: 'Approved', detail: 'Printing receipt…'};
    if (connectedUi) return {title: 'Ready', detail: 'Tap card now'};
    return {title: 'Preparing…', detail: 'Getting reader ready'};
  }, [connectedUi, isReaderBusy, terminalStatusLine]);

  // ✅ Auto-start as soon as the screen appears (no button UX)
  useEffect(() => {
    if (didStartRef.current) return;
    didStartRef.current = true;

    setUiLine('Preparing terminal…');

    const id = setTimeout(async () => {
      try {
        setUiLine('Starting payment…');
        await onStart?.();
      } catch (e) {
        console.log('CardTapScreen onStart error:', e);
        // Employee-friendly message (no “ref not ready” / no tech jargon)
        Alert.alert(
          'Card terminal is still getting ready',
          'Please wait a moment. If it does not start in 5 seconds, go Back and try again.',
        );
      }
    }, 350);

    return () => clearTimeout(id);
  }, [onStart]);

  return (
    <View style={[s.root, {backgroundColor: t.bg}]}>
      <View style={[s.card, {backgroundColor: t.card, borderColor: t.border}]}>
        <View style={s.headerRow}>
          <Pressable onPress={onBack} style={[s.chip, {borderColor: t.border}]}>
            <Text style={[s.chipText, {color: t.text}]}>Back</Text>
          </Pressable>

          <Text style={[s.title, {color: t.text}]}>Tap Card</Text>

          <Pressable
            onPress={onCancel}
            style={[s.chip, {borderColor: t.border}]}>
            <Text style={[s.chipText, {color: t.danger}]}>Cancel</Text>
          </Pressable>
        </View>

        <View style={[s.amountBox, {borderColor: t.border}]}>
          <Text style={[s.amountLabel, {color: t.muted}]}>Total</Text>
          <Text style={[s.amountText, {color: t.text}]}>{totalLabel}</Text>

          <View style={{marginTop: 12, alignItems: 'center'}}>
            <Text style={[s.bigStatus, {color: t.gold}]}>
              {derivedStatus.title}
            </Text>
            <Text style={[s.subText, {color: t.muted}]}>
              {derivedStatus.detail}
            </Text>

            {/* subtle spinner while “not yet ready” */}
            {derivedStatus.title !== 'Ready' &&
            derivedStatus.title !== 'Approved' ? (
              <View style={{marginTop: 10}}>
                <ActivityIndicator />
              </View>
            ) : null}
          </View>
        </View>

        <View style={[s.statusBox, {borderColor: t.border}]}>
          <Text style={[s.statusLabel, {color: t.muted}]}>Reader</Text>
          <Text style={[s.statusValue, {color: t.text}]}>
            {connectedUi ? 'Connected' : 'Not connected'}
            {readerLabel ? ` · ${readerLabel}` : ''}
          </Text>

          {terminalStatusLine ? (
            <Text style={[s.terminalLine, {color: t.muted}]}>
              {terminalStatusLine}
            </Text>
          ) : (
            <Text style={[s.terminalLine, {color: t.muted}]}>{uiLine}</Text>
          )}
        </View>

        {/* ✅ No “Start/Retry” button by design */}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {flex: 1, padding: 16, justifyContent: 'center'},
  card: {borderRadius: 22, borderWidth: 1, padding: 18},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {fontSize: 20, fontWeight: '900'},
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#111827',
    minWidth: 70,
    alignItems: 'center',
  },
  chipText: {fontSize: 13, fontWeight: '900'},

  amountBox: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    backgroundColor: '#0b1222',
    alignItems: 'center',
  },
  amountLabel: {fontSize: 12, fontWeight: '900'},
  amountText: {marginTop: 6, fontSize: 46, fontWeight: '900'},
  bigStatus: {marginTop: 6, fontSize: 22, fontWeight: '900'},
  subText: {marginTop: 6, fontSize: 13, fontWeight: '800', textAlign: 'center'},

  statusBox: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    backgroundColor: '#0b1222',
  },
  statusLabel: {fontSize: 12, fontWeight: '900'},
  statusValue: {marginTop: 6, fontSize: 14, fontWeight: '900'},
  terminalLine: {marginTop: 8, fontSize: 12, fontWeight: '700'},
});
