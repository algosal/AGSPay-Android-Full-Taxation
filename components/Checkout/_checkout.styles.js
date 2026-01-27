// FILE: components/Checkout/CheckoutScreen.js
import React, {useMemo, useState} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {pressFX, androidRipple} from '../ui/pressFX';

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function CheckoutScreen({
  theme, // ✅ CHANGED: accept theme from App.js

  chargeData,
  onBack,

  // final actions
  onCashConfirm,
  onCardConfirm,

  isBusy,
}) {
  /**
   * ✅ CHANGED: theme palette (no logic change)
   * We only replace hardcoded colors with theme values.
   */
  const t = useMemo(() => {
    const bg = theme?.bg ?? '#020617';
    const card = theme?.card ?? '#050814';
    const inputBg = theme?.inputBg ?? '#0b1222';
    const text = theme?.text ?? '#ffffff';
    const muted = theme?.muted ?? '#9ca3af';
    const border = theme?.border ?? '#1f2937';
    const gold = theme?.gold ?? '#d4af37';
    const goldText = theme?.goldText ?? '#020617';

    // chip / alt background (theme-friendly)
    const altCard = theme?.inputBg ?? '#111827';

    return {bg, card, inputBg, text, muted, border, gold, goldText, altCard};
  }, [theme]);

  const data = useMemo(() => {
    const d = chargeData || {};

    const subtotalCents = Number(d.subtotalCents || 0);
    const taxCents = Number(d.taxCents || 0);
    const albaFeeCents = Number(d.albaFeeCents || 0);
    const tipCents = Number(d.tipCents || 0);
    const totalCents = Number(d.totalCents ?? 0);

    return {
      subtotalCents,
      taxCents,
      albaFeeCents,
      tipCents,
      totalCents,
      totalLabel: d.totalLabel || centsToMoney(totalCents),
      raw: d,
    };
  }, [chargeData]);

  // default to CASH (employee-friendly)
  const [method, setMethod] = useState(() => {
    const m = String(chargeData?.method || 'CASH').toUpperCase();
    return m === 'CARD' ? 'CARD' : 'CASH';
  });

  const confirmLabel =
    method === 'CASH' ? 'Complete Cash & Print Receipt' : 'Charge Card';

  return (
    <View style={[s.root, {backgroundColor: t.bg}]}>
      <View style={[s.card, {backgroundColor: t.card, borderColor: t.border}]}>
        {/* Header */}
        <View style={s.headerRow}>
          <Pressable
            onPress={onBack}
            {...androidRipple('rgba(250,204,21,0.12)')}
            style={({pressed}) => [
              s.backBtn,
              {borderColor: t.border, backgroundColor: t.altCard},
              pressFX({pressed}),
            ]}>
            <Text style={[s.backText, {color: t.text}]}>Back</Text>
          </Pressable>

          <Text style={[s.title, {color: t.text}]}>Checkout</Text>

          <View style={{width: 60}} />
        </View>

        {/* Payment Method */}
        <Text style={[s.sectionLabel, {color: t.muted}]}>Payment Method</Text>

        <View style={s.methodRow}>
          <Pressable
            onPress={() => setMethod('CASH')}
            {...androidRipple('rgba(250,204,21,0.12)')}
            style={({pressed}) => [
              s.methodBtn,
              {
                borderColor: t.border,
                backgroundColor: t.altCard,
              },
              method === 'CASH'
                ? {borderColor: t.gold, backgroundColor: t.inputBg}
                : null,
              pressFX({pressed}),
            ]}>
            <Text
              style={[
                s.methodText,
                {color: method === 'CASH' ? t.gold : t.text},
              ]}>
              CASH
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMethod('CARD')}
            {...androidRipple('rgba(250,204,21,0.12)')}
            style={({pressed}) => [
              s.methodBtn,
              {
                borderColor: t.border,
                backgroundColor: t.altCard,
              },
              method === 'CARD'
                ? {borderColor: t.gold, backgroundColor: t.inputBg}
                : null,
              pressFX({pressed}),
            ]}>
            <Text
              style={[
                s.methodText,
                {color: method === 'CARD' ? t.gold : t.text},
              ]}>
              CARD
            </Text>
          </Pressable>
        </View>

        {/* Summary */}
        <View
          style={[
            s.summaryBox,
            {borderColor: t.border, backgroundColor: t.inputBg},
          ]}>
          <Row
            themeT={t}
            label="Subtotal"
            value={centsToMoney(data.subtotalCents)}
          />
          <Row
            themeT={t}
            label="Sales Tax"
            value={centsToMoney(data.taxCents)}
          />
          <Row
            themeT={t}
            label="Service Fee"
            value={centsToMoney(data.albaFeeCents)}
          />
          <Row themeT={t} label="Tip" value={centsToMoney(data.tipCents)} />

          <View style={[s.divider, {backgroundColor: t.border}]} />

          <View style={s.totalRow}>
            <Text style={[s.totalLabel, {color: t.text}]}>TOTAL</Text>
            <Text style={[s.totalValue, {color: t.text}]}>
              {centsToMoney(data.totalCents)}
            </Text>
          </View>
        </View>

        {/* Confirm */}
        <Pressable
          disabled={isBusy}
          {...androidRipple('rgba(0,0,0,0.10)')}
          style={({pressed}) => [
            s.primaryBtn,
            {backgroundColor: t.gold},
            isBusy ? s.primaryBtnDisabled : null,
            pressFX({pressed}),
          ]}
          onPress={() => {
            const payload = {
              ...(data.raw || {}),
              method,
              totalCents: data.totalCents,
              totalLabel: data.totalLabel,
            };

            if (method === 'CASH') {
              onCashConfirm?.(payload);
            } else {
              onCardConfirm?.(payload);
            }
          }}>
          <Text style={[s.primaryText, {color: t.goldText}]}>
            {isBusy ? 'Processing…' : confirmLabel}
          </Text>
        </Pressable>

        <Text style={[s.note, {color: t.muted}]}>
          {method === 'CASH'
            ? 'Confirm cash received and print receipt.'
            : 'Customer will tap card on the reader.'}
        </Text>
      </View>
    </View>
  );
}

function Row({label, value, themeT}) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, {color: themeT.muted}]}>{label}</Text>
      <Text style={[s.rowValue, {color: themeT.text}]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {fontSize: 20, fontWeight: '900'},

  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  backText: {fontSize: 13, fontWeight: '900'},

  sectionLabel: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 6,
  },

  methodRow: {flexDirection: 'row', gap: 10, marginTop: 10},
  methodBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  methodText: {fontWeight: '900'},

  summaryBox: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: {fontWeight: '800'},
  rowValue: {fontWeight: '900'},

  divider: {height: 1, marginVertical: 10},

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {fontWeight: '900', letterSpacing: 1},
  totalValue: {fontWeight: '900', fontSize: 18},

  primaryBtn: {
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: {opacity: 0.6},
  primaryText: {fontWeight: '900', fontSize: 15},

  note: {marginTop: 10, fontSize: 12, fontWeight: '700'},
});
