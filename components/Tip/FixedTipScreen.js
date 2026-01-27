// FILE: components/Tip/FixedTipScreen.js
import React, {useMemo} from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const GOLD = '#d4af37';

function moneyLabelFromCents(cents) {
  const c = Math.max(0, Number(cents || 0));
  return `$${(c / 100).toFixed(2)}`;
}

export default function FixedTipScreen({
  chargeData,
  onOther, // go to TipScreen (custom keypad)
  onDone, // proceed directly to totals/checkout with selected preset
  theme,
}) {
  const t = useMemo(() => {
    const bg = theme?.bg ?? '#020617';
    const card = theme?.card ?? '#050814';
    const inputBg = theme?.inputBg ?? '#0b1222';
    const text = theme?.text ?? '#ffffff';
    const muted = theme?.muted ?? '#9ca3af';
    const border = theme?.border ?? '#1f2937';
    const gold = theme?.gold ?? GOLD;
    const altCard = theme?.inputBg ?? '#111827';
    return {bg, card, inputBg, text, muted, border, gold, altCard};
  }, [theme]);

  const corporateName =
    chargeData?.corporateName || chargeData?.meta?.corporateName || '';
  const storeName = chargeData?.storeName || chargeData?.meta?.storeName || '';
  const subtitle =
    (corporateName || 'Corporate') + ' · ' + (storeName || 'Store');

  // Preset tips (edit these freely)
  const presets = [
    {label: '$1', cents: 100},
    {label: '$3', cents: 300},
    {label: '$5', cents: 500},
    {label: '$10', cents: 1000},
  ];

  function pickTip(tipCents) {
    if (typeof onDone !== 'function') {
      Alert.alert('Navigation error', 'onDone not wired.');
      return;
    }
    onDone({tipCents: Number(tipCents || 0)});
  }

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

      {/* Card */}
      <View
        style={[styles.card, {borderColor: t.border, backgroundColor: t.card}]}>
        <Text style={[styles.cardLabel, {color: t.muted}]}>Choose a tip</Text>

        <View style={styles.grid}>
          {presets.map((p, idx) => (
            <Pressable
              key={`${p.label}-${idx}`}
              onPress={() => pickTip(p.cents)}
              style={({pressed}) => [
                styles.presetBox,
                {
                  borderColor: t.border,
                  backgroundColor: t.inputBg,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}>
              <Text style={[styles.presetTop, {color: t.text}]}>{p.label}</Text>
              <Text style={[styles.presetBottom, {color: t.muted}]}>
                {moneyLabelFromCents(p.cents)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Other -> go to keypad tip screen */}
        <Pressable
          onPress={onOther}
          style={({pressed}) => [
            styles.otherRow,
            {
              borderColor: t.border,
              backgroundColor: t.altCard,
              opacity: pressed ? 0.9 : 1,
            },
          ]}>
          <View style={{flex: 1}}>
            <Text style={[styles.otherTitle, {color: t.text}]}>Other</Text>
            <Text style={[styles.otherSub, {color: t.muted}]}>$0.00</Text>
          </View>

          <Text style={[styles.otherChevron, {color: t.gold}]}>›</Text>
        </Pressable>

        <Text style={[styles.hint, {color: t.muted}]}>
          Choose Other to enter a custom tip (including $0.00).
        </Text>
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

  card: {
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  cardLabel: {fontWeight: '900', fontSize: 12, marginBottom: 10},

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetBox: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  presetTop: {fontSize: 22, fontWeight: '900'},
  presetBottom: {marginTop: 4, fontSize: 12, fontWeight: '800'},

  otherRow: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  otherTitle: {fontSize: 16, fontWeight: '900'},
  otherSub: {marginTop: 2, fontSize: 12, fontWeight: '800'},
  otherChevron: {fontSize: 26, fontWeight: '900', marginLeft: 10},

  hint: {marginTop: 10, fontSize: 12, textAlign: 'center'},
});
