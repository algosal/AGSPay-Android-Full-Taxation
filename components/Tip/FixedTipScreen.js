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

// Try to infer the base charge amount (in cents) from common fields.
// Adjust/add fields here if your chargeData uses a different schema.
function getBaseAmountCents(chargeData) {
  const cd = chargeData || {};
  const meta = cd.meta || {};

  // Common patterns:
  // - amountCents / subtotalCents / totalCents
  // - amount (already cents) or amount in dollars (less common)
  const candidates = [
    cd.amountCents,
    cd.subtotalCents,
    cd.totalCents,
    cd.chargeCents,
    meta.amountCents,
    meta.subtotalCents,
    meta.totalCents,
    meta.chargeCents,
  ].filter(v => v !== undefined && v !== null);

  if (candidates.length) {
    const n = Number(candidates[0]);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  // If you *know* your field name, you can hard-wire it:
  // return Number(cd.amount_cents || 0);

  return 0;
}

function tipFromPercent(baseCents, percent) {
  const b = Math.max(0, Number(baseCents || 0));
  const p = Math.max(0, Number(percent || 0));
  // Round to nearest cent
  return Math.round((b * p) / 100);
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

  const baseCents = useMemo(() => getBaseAmountCents(chargeData), [chargeData]);

  // Percent presets (edit freely)
  const percentPresets = [10, 15, 20, 25];

  function pickTip(tipCents) {
    if (typeof onDone !== 'function') {
      Alert.alert('Navigation error', 'onDone not wired.');
      return;
    }
    onDone({tipCents: Number(tipCents || 0)});
  }

  const tiles = [
    ...percentPresets.map(pct => {
      const cents = tipFromPercent(baseCents, pct);
      return {
        key: `pct-${pct}`,
        top: `${pct}%`,
        bottom: moneyLabelFromCents(cents),
        onPress: () => pickTip(cents),
      };
    }),

    // “No tip, thank you” as a tile (same style)
    {
      key: 'no-tip',
      top: 'No tip',
      bottom: 'Thank you',
      onPress: () => pickTip(0),
      variant: 'alt', // tint it with gold text like your "alt" style
    },

    // “Other amount” as a tile (same style)
    {
      key: 'other',
      top: 'Other',
      bottom: moneyLabelFromCents(0),
      onPress: onOther,
      variant: 'alt',
    },
  ];

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

        {/* Optional: show base amount if available */}
        <Text style={[styles.baseRow, {color: t.muted}]}>
          Based on: {moneyLabelFromCents(baseCents)}
        </Text>

        <View style={styles.grid}>
          {tiles.map(tile => (
            <Pressable
              key={tile.key}
              onPress={tile.onPress}
              style={({pressed}) => [
                styles.presetBox,
                {
                  borderColor: t.border,
                  backgroundColor:
                    tile.variant === 'alt' ? t.altCard : t.inputBg,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}>
              <Text
                style={[
                  styles.presetTop,
                  {color: tile.variant === 'alt' ? t.gold : t.text},
                ]}>
                {tile.top}
              </Text>
              <Text style={[styles.presetBottom, {color: t.muted}]}>
                {tile.bottom}
              </Text>
            </Pressable>
          ))}
        </View>

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
  cardLabel: {fontWeight: '900', fontSize: 12, marginBottom: 6},

  baseRow: {fontSize: 12, fontWeight: '800', marginBottom: 10},

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
  presetTop: {fontSize: 20, fontWeight: '900'},
  presetBottom: {marginTop: 4, fontSize: 12, fontWeight: '800'},

  hint: {marginTop: 10, fontSize: 12, textAlign: 'center'},
});
