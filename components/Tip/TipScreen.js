// components/Tip/TipScreen.js
import React, {useMemo, useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

const GOLD = '#d4af37';

function formatMoneyFromDigits(digits) {
  const s = String(digits || '').replace(/[^\d]/g, '');
  const cents = s.length ? parseInt(s, 10) : 0;
  return {
    cents,
    label: `$${(cents / 100).toFixed(2)}`,
  };
}

export default function TipScreen({chargeData, onBack, onDone, theme}) {
  // tip digits represent cents (same as your AmountEntry approach)
  const [digits, setDigits] = useState('0');

  const money = useMemo(() => formatMoneyFromDigits(digits), [digits]);

  function pushDigit(d) {
    setDigits(prev => {
      const p = String(prev || '0').replace(/[^\d]/g, '');
      const next = (p === '0' ? '' : p) + String(d);
      if (next.length > 10) return p || '0';
      return next.replace(/^0+/, '') || '0';
    });
  }

  function backspace() {
    setDigits(prev => {
      const s = String(prev || '0');
      if (s.length <= 1) return '0';
      return s.slice(0, -1);
    });
  }

  function clearAll() {
    setDigits('0');
  }

  function proceed() {
    if (typeof onDone !== 'function') {
      Alert.alert('Navigation error', 'onDone not wired.');
      return;
    }

    // Tip can be $0.00 — allow it.
    onDone({tipCents: Number(money.cents || 0)});
  }

  const corporateName =
    chargeData?.corporateName || chargeData?.meta?.corporateName || '';
  const storeName = chargeData?.storeName || chargeData?.meta?.storeName || '';
  const subtitle =
    (corporateName || 'Corporate') + ' · ' + (storeName || 'Store');

  const keys = [
    ['1', () => pushDigit(1)],
    ['2', () => pushDigit(2)],
    ['3', () => pushDigit(3)],
    ['4', () => pushDigit(4)],
    ['5', () => pushDigit(5)],
    ['6', () => pushDigit(6)],
    ['7', () => pushDigit(7)],
    ['8', () => pushDigit(8)],
    ['9', () => pushDigit(9)],
    ['C', clearAll, 'alt'],
    ['0', () => pushDigit(0)],
    ['⌫', backspace, 'alt'],
  ];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={{flex: 1, alignItems: 'center'}}>
          <Text style={styles.title}>Add Tip</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={{width: 64}} />
      </View>

      <View style={styles.amountBox}>
        <Text style={styles.amountLabel}>Tip</Text>
        <Text style={styles.amountText} numberOfLines={1} adjustsFontSizeToFit>
          {money.label}
        </Text>
        <Text style={styles.amountHint}>Tap numbers to set tip</Text>
      </View>

      <View style={styles.keypad}>
        <View style={styles.grid}>
          {keys.map(([label, fn, variant], idx) => (
            <TouchableOpacity
              key={`${label}-${idx}`}
              style={[styles.key, variant === 'alt' ? styles.keyAlt : null]}
              onPress={fn}>
              <Text
                style={[
                  styles.keyText,
                  variant === 'alt' ? {color: GOLD} : null,
                ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.continueBtn} onPress={proceed}>
          <Text style={styles.continueText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#020617', padding: 16},
  header: {flexDirection: 'row', alignItems: 'center'},
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
  },
  backText: {fontSize: 13, color: '#fff', fontWeight: '900'},
  title: {color: '#fff', fontSize: 18, fontWeight: '900'},
  sub: {color: '#9ca3af', fontWeight: '700', marginTop: 2, fontSize: 12},

  amountBox: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#050814',
    padding: 14,
    alignItems: 'center',
  },
  amountLabel: {color: '#9ca3af', fontWeight: '900', fontSize: 12},
  amountText: {color: '#fff', fontSize: 44, fontWeight: '900', marginTop: 6},
  amountHint: {marginTop: 6, color: '#9ca3af', fontSize: 12},

  keypad: {flex: 1, justifyContent: 'center', marginTop: 12},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  key: {
    width: '31.8%',
    height: 64,
    borderRadius: 16,
    backgroundColor: '#0b1222',
    borderWidth: 1,
    borderColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyAlt: {backgroundColor: '#111827'},
  keyText: {color: '#fff', fontSize: 22, fontWeight: '900'},

  bottomRow: {flexDirection: 'row', marginTop: 8},
  continueBtn: {
    flex: 1,
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueText: {color: '#020617', fontWeight: '900', fontSize: 16},
});
