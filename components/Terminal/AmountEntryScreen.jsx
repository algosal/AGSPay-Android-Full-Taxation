// FILE: components/Terminal/AmountEntryScreen.js

import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';

const GOLD = '#d4af37';

function formatMoneyFromDigits(digits) {
  const s = String(digits || '').replace(/[^\d]/g, '');
  const cents = s.length ? parseInt(s, 10) : 0;
  return (cents / 100).toFixed(2);
}

export default function AmountEntryScreen({
  initialValue = '',
  onDone,
  onBack,
  theme,
}) {
  const [digits, setDigits] = useState(() => {
    const cleaned = String(initialValue || '').replace(/[^\d]/g, '');
    return cleaned || '';
  });

  const t = useMemo(
    () => ({
      bg: theme?.bg ?? '#020617',
      card: theme?.card ?? '#050814',
      text: theme?.text ?? '#ffffff',
      muted: theme?.muted ?? '#9ca3af',
      border: theme?.border ?? '#1f2937',
      gold: theme?.gold ?? GOLD,
    }),
    [theme],
  );

  const amountText = useMemo(() => formatMoneyFromDigits(digits), [digits]);

  const {width: screenW, height: screenH} = Dimensions.get('window');

  const pad = 14;
  const gap = 10;
  const cols = 3;

  const usableW = screenW - pad * 2;
  const btnW = Math.floor((usableW - gap * (cols - 1)) / cols);

  // ✅ clamp btnH so StatusBar hidden doesn't inflate layout
  const btnHRaw = Math.min(btnW, Math.floor((screenH * 0.52) / 4) - gap);
  const btnH = Math.min(btnHRaw, 92);

  // ✅ “real button” press effect (fast + POS-like)
  const pressFX = pressed => ({
    opacity: pressed ? 0.88 : 1,
    transform: [{scale: pressed ? 0.985 : 1}],
    ...(Platform.OS === 'android' ? {elevation: pressed ? 1 : 4} : null),
  });

  function pushDigit(d) {
    setDigits(prev => {
      const p = String(prev || '').replace(/[^\d]/g, '');
      const next = (p + String(d)).slice(0, 10);
      return next.replace(/^0+/, '') || '';
    });
  }

  function backspace() {
    setDigits(prev => {
      const p = String(prev || '').replace(/[^\d]/g, '');
      if (!p.length) return '';
      return p.slice(0, -1);
    });
  }

  function clearAll() {
    setDigits('');
  }

  function handleDone() {
    const cents = parseInt(String(digits || ''), 10) || 0;
    if (cents < 1) {
      Alert.alert('Enter amount', 'Amount must be at least $0.01');
      return;
    }

    onDone?.({
      amountText: `$${(cents / 100).toFixed(2)}`,
      amountCents: cents,
      rawDigits: String(digits || ''),
    });
  }

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
    <SafeAreaView style={[styles.root, {backgroundColor: t.bg}]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={[styles.backText, {color: t.gold}]}>Back</Text>
        </Pressable>

        <View style={{flex: 1, alignItems: 'center'}}>
          <Text style={[styles.title, {color: t.text}]}>Enter Amount</Text>
        </View>

        <View style={{width: 60}} />
      </View>

      {/* Centered Amount Display */}
      <View
        style={[
          styles.displayCard,
          {backgroundColor: t.card, borderColor: t.border},
        ]}>
        <Text style={[styles.label, {color: t.muted}]}>Total</Text>

        <Text
          style={[styles.amount, {color: t.text}]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}>
          ${amountText}
        </Text>

        <Text style={[styles.hint, {color: t.muted}]}>
          Tap numbers to enter amount
        </Text>
      </View>

      {/* Keypad */}
      <View style={[styles.keypadWrap, {paddingHorizontal: pad}]}>
        <View style={styles.grid}>
          {keys.map(([label, fn, variant], idx) => {
            const col = idx % 3;
            const isLastCol = col === 2;

            return (
              <Pressable
                key={`${label}-${idx}`}
                onPress={fn}
                android_ripple={{color: 'rgba(250,204,21,0.16)'}}
                style={({pressed}) => [
                  styles.key,
                  {
                    width: btnW,
                    height: btnH,
                    marginBottom: gap,
                    marginRight: isLastCol ? 0 : gap,
                    backgroundColor: variant === 'alt' ? '#0b1224' : t.card,
                    borderColor: t.border,
                    // iOS shadow (subtle) + Android elevation already handled in pressFX
                    shadowOpacity: 0.18,
                    shadowRadius: 6,
                    shadowOffset: {width: 0, height: 3},
                  },
                  pressFX(pressed),
                ]}>
                <Text
                  style={[
                    styles.keyText,
                    {color: variant === 'alt' ? t.gold : t.text},
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Continue */}
      <View style={[styles.actions, {paddingHorizontal: pad}]}>
        <Pressable
          onPress={handleDone}
          android_ripple={{color: 'rgba(0,0,0,0.10)'}}
          style={({pressed}) => [
            styles.primaryBtn,
            {backgroundColor: t.gold},
            {
              opacity: pressed ? 0.92 : 1,
              transform: [{scale: pressed ? 0.99 : 1}],
              ...(Platform.OS === 'android'
                ? {elevation: pressed ? 1 : 3}
                : null),
            },
          ]}>
          <Text style={styles.primaryText}>Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {width: 60, paddingVertical: 8},
  backText: {fontWeight: '800'},
  title: {fontSize: 18, fontWeight: '900'},

  displayCard: {
    marginHorizontal: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    alignItems: 'center',
  },
  label: {fontSize: 12, fontWeight: '700'},
  amount: {marginTop: 8, fontSize: 44, fontWeight: '900'},
  hint: {marginTop: 6, fontSize: 12},

  keypadWrap: {flex: 1, justifyContent: 'center'},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  key: {
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // default elevation for “button” feel (Android)
    elevation: 4,
  },
  keyText: {fontSize: 26, fontWeight: '900'},

  actions: {paddingBottom: 14},
  primaryBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {color: '#020617', fontWeight: '900', fontSize: 16},
});
