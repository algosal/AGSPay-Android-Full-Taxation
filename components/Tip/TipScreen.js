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

export default function TipScreen({chargeData, onDone, theme}) {
  // tip digits represent cents
  const [digits, setDigits] = useState('0');

  const money = useMemo(() => formatMoneyFromDigits(digits), [digits]);

  // ✅ Theme palette (same idea as AmountEntryScreen)
  const t = useMemo(() => {
    const bg = theme?.bg ?? '#020617';
    const card = theme?.card ?? '#050814';
    const inputBg = theme?.inputBg ?? '#0b1222';
    const text = theme?.text ?? '#ffffff';
    const muted = theme?.muted ?? '#9ca3af';
    const border = theme?.border ?? '#1f2937';
    const gold = theme?.gold ?? GOLD;

    // For alt keys + chips (theme-friendly)
    const altCard = theme?.inputBg ?? '#111827';

    return {bg, card, inputBg, text, muted, border, gold, altCard};
  }, [theme]);

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

  // ✅ Deterministic keypad sizing
  const {width: screenW, height: screenH} = Dimensions.get('window');
  const pad = 16;
  const gap = 10;
  const gridCols = 3;

  const usableW = screenW - pad * 2;
  const btnW = Math.floor((usableW - gap * (gridCols - 1)) / gridCols);
  const btnH = Math.min(btnW, Math.floor((screenH * 0.52) / 4) - gap);

  return (
    <SafeAreaView style={[styles.root, {backgroundColor: t.bg}]}>
      {/* Header (NO BACK) */}
      <View style={styles.header}>
        <View style={{width: 64}} />

        <View style={{flex: 1, alignItems: 'center'}} pointerEvents="none">
          <Text style={[styles.title, {color: t.text}]}>Add Tip</Text>
          <Text style={[styles.sub, {color: t.muted}]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={{width: 64}} />
      </View>

      {/* Amount Box */}
      <View
        style={[
          styles.amountBox,
          {borderColor: t.border, backgroundColor: t.card},
        ]}>
        <Text style={[styles.amountLabel, {color: t.muted}]}>Tip</Text>

        <Text
          style={[styles.amountText, {color: t.text}]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {money.label}
        </Text>

        <Text style={[styles.amountHint, {color: t.muted}]}>
          Tap numbers to set tip
        </Text>
      </View>

      {/* Keypad */}
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
                  borderColor: t.border,
                  backgroundColor: variant === 'alt' ? t.altCard : t.inputBg,
                },
              ]}>
              <Text
                style={[
                  styles.keyText,
                  {color: variant === 'alt' ? t.gold : t.text},
                ]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Continue */}
      <View style={[styles.bottomRow, {paddingHorizontal: pad}]}>
        <Pressable
          onPress={proceed}
          style={({pressed}) => [
            styles.continueBtn,
            {opacity: pressed ? 0.9 : 1, backgroundColor: t.gold},
          ]}>
          <Text style={styles.continueText}>Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  title: {fontSize: 18, fontWeight: '900'},
  sub: {fontWeight: '700', marginTop: 2, fontSize: 12},

  amountBox: {
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  amountLabel: {fontWeight: '900', fontSize: 12},
  amountText: {fontSize: 44, fontWeight: '900', marginTop: 6},
  amountHint: {marginTop: 6, fontSize: 12},

  keypadWrap: {flex: 1, justifyContent: 'center', marginTop: 10},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  key: {
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {fontSize: 22, fontWeight: '900'},

  bottomRow: {paddingBottom: 14},
  continueBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueText: {color: '#020617', fontWeight: '900', fontSize: 16},
});
