// FILE: components/Tip/TipScreen.js
import React, {useMemo, useState} from 'react';
import {
  Alert,
  Dimensions,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const GOLD = '#d4af37';

function formatMoneyFromDigits(digits) {
  const s = String(digits || '').replace(/[^\d]/g, '');
  const cents = s.length ? parseInt(s, 10) : 0;
  return {
    cents,
    label: `$${(cents / 100).toFixed(2)}`,
  };
}

export default function TipScreen({chargeData, onBack, onDone}) {
  // tip digits represent cents
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
      const s = String(prev || '0').replace(/[^\d]/g, '');
      if (s.length <= 1) return '0';
      return s.slice(0, -1) || '0';
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

  // ✅ Deterministic keypad sizing (fixes “off” layout on Android / Fabric)
  const {width: screenW, height: screenH} = Dimensions.get('window');
  const pad = 16;
  const gap = 10;
  const gridCols = 3;

  const usableW = screenW - pad * 2;
  const btnW = Math.floor((usableW - gap * (gridCols - 1)) / gridCols);
  const btnH = Math.min(btnW, Math.floor((screenH * 0.52) / 4) - gap);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={{flex: 1, alignItems: 'center'}} pointerEvents="none">
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

      <View style={[styles.keypadWrap, {paddingHorizontal: pad}]}>
        <View style={[styles.grid, {gap}]}>
          {keys.map(([label, fn, variant], idx) => (
            <Pressable
              key={`${label}-${idx}`}
              onPress={fn}
              style={({pressed}) => [
                styles.key,
                {
                  width: btnW,
                  height: btnH,
                  opacity: pressed ? 0.85 : 1,
                  backgroundColor: variant === 'alt' ? '#111827' : '#0b1222',
                },
              ]}>
              <Text
                style={[
                  styles.keyText,
                  variant === 'alt' ? {color: GOLD} : null,
                ]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.bottomRow, {paddingHorizontal: pad}]}>
        <Pressable
          onPress={proceed}
          style={({pressed}) => [
            styles.continueBtn,
            {opacity: pressed ? 0.9 : 1},
          ]}>
          <Text style={styles.continueText}>Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#020617'},
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
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
    marginHorizontal: 16,
    marginTop: 6,
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

  keypadWrap: {flex: 1, justifyContent: 'center', marginTop: 10},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  key: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {color: '#fff', fontSize: 22, fontWeight: '900'},

  bottomRow: {paddingBottom: 14},
  continueBtn: {
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueText: {color: '#020617', fontWeight: '900', fontSize: 16},
});
