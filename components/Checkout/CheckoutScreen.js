// FILE: components/Checkout/CheckoutScreen.js

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, View, Text, Pressable, StyleSheet} from 'react-native';
import {pressFX, androidRipple} from '../ui/pressFX';

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function CheckoutScreen({
  theme,
  chargeData,
  onBack,
  onCancel,
  onCashConfirm,
  onCardConfirm,
  isBusy,
}) {
  const t = useMemo(() => {
    const bg = theme?.bg ?? '#020617';
    const card = theme?.card ?? '#050814';
    const inputBg = theme?.inputBg ?? '#0b1222';
    const text = theme?.text ?? '#ffffff';
    const muted = theme?.muted ?? '#9ca3af';
    const border = theme?.border ?? '#1f2937';
    const gold = theme?.gold ?? '#d4af37';
    const goldText = theme?.goldText ?? '#020617';
    const altCard = theme?.inputBg ?? '#111827';
    return {bg, card, inputBg, text, muted, border, gold, goldText, altCard};
  }, [theme]);

  // Default payment method
  const [method, setMethod] = useState(() => {
    const m = String(chargeData?.method || 'CARD').toUpperCase();
    return m === 'CASH' ? 'CASH' : 'CARD';
  });

  // International card toggle
  const [isInternational, setIsInternational] = useState(() => {
    return Boolean(chargeData?.isInternational || false);
  });

  // NEW: taxation toggle
  const [taxEnabled, setTaxEnabled] = useState(() => {
    const incomingTax = Number(chargeData?.taxCents || 0);
    return incomingTax > 0;
  });

  // Sync method if parent data changes
  useEffect(() => {
    const m = String(chargeData?.method || 'CARD').toUpperCase();
    setMethod(m === 'CASH' ? 'CASH' : 'CARD');
  }, [chargeData?.method]);

  // Sync international toggle from parent if present
  useEffect(() => {
    if (typeof chargeData?.isInternational === 'boolean') {
      setIsInternational(chargeData.isInternational);
    }
  }, [chargeData?.isInternational]);

  // Sync taxation toggle from parent tax amount
  useEffect(() => {
    const incomingTax = Number(chargeData?.taxCents || 0);
    setTaxEnabled(incomingTax > 0);
  }, [chargeData?.taxCents]);

  // Clear international flag when not card
  useEffect(() => {
    if (method !== 'CARD' && isInternational) setIsInternational(false);
  }, [method]);

  const data = useMemo(() => {
    const d = chargeData || {};

    const subtotalCents = Number(d.subtotalCents || 0);

    // infer tax rate from incoming numbers so App.js does not need changes
    const originalTaxCents = Number(d.taxCents || 0);
    const inferredTaxRate =
      subtotalCents > 0 && originalTaxCents > 0
        ? originalTaxCents / subtotalCents
        : 0;

    const taxCents = taxEnabled
      ? Math.round(subtotalCents * inferredTaxRate)
      : 0;

    const albaFeeCents = Number(d.albaFeeCents || 0);
    const tipCents = Number(d.tipCents || 0);

    const internationalFeeCents =
      method === 'CARD' && isInternational ? 100 : 0;

    const totalCents =
      subtotalCents +
      taxCents +
      albaFeeCents +
      tipCents +
      internationalFeeCents;

    return {
      subtotalCents,
      taxCents,
      albaFeeCents,
      tipCents,
      internationalFeeCents,
      totalCents,
      totalLabel: centsToMoney(totalCents),
      raw: d,
    };
  }, [chargeData, method, isInternational, taxEnabled]);

  const confirmLabel =
    method === 'CASH' ? 'Complete Cash & Email Receipt' : 'Charge Card';

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
              {borderColor: t.border, backgroundColor: t.altCard},
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
              {borderColor: t.border, backgroundColor: t.altCard},
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

        {/* NEW: Taxation button */}
        <View style={s.taxRow}>
          <Pressable
            onPress={() => setTaxEnabled(v => !v)}
            {...androidRipple('rgba(250,204,21,0.12)')}
            style={({pressed}) => [
              s.taxBtn,
              {borderColor: t.border, backgroundColor: t.altCard},
              taxEnabled
                ? {borderColor: t.gold, backgroundColor: t.inputBg}
                : null,
              pressFX({pressed}),
            ]}>
            <Text style={[s.taxText, {color: taxEnabled ? t.gold : t.text}]}>
              {taxEnabled ? 'Taxation: ON' : 'Taxation: OFF'}
            </Text>
          </Pressable>
        </View>

        {/* International toggle for card only */}
        {method === 'CARD' ? (
          <View style={s.intlRow}>
            <Pressable
              onPress={() => setIsInternational(v => !v)}
              {...androidRipple('rgba(250,204,21,0.12)')}
              style={({pressed}) => [
                s.intlBtn,
                {borderColor: t.border, backgroundColor: t.altCard},
                isInternational
                  ? {borderColor: t.gold, backgroundColor: t.inputBg}
                  : null,
                pressFX({pressed}),
              ]}>
              <Text
                style={[
                  s.intlText,
                  {color: isInternational ? t.gold : t.text},
                ]}>
                {isInternational
                  ? 'International Card: YES (+$1)'
                  : 'International Card: NO'}
              </Text>
            </Pressable>
          </View>
        ) : null}

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

          {data.internationalFeeCents > 0 ? (
            <Row
              themeT={t}
              label="International Fee"
              value={centsToMoney(data.internationalFeeCents)}
            />
          ) : null}

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
              taxEnabled,
              taxCents: data.taxCents,
              isInternational:
                method === 'CARD' ? Boolean(isInternational) : false,
              internationalFeeCents: data.internationalFeeCents,
              totalCents: data.totalCents,
              totalLabel: data.totalLabel,
            };

            if (method === 'CASH') onCashConfirm?.(payload);
            else onCardConfirm?.(payload);
          }}>
          <Text style={[s.primaryText, {color: t.goldText}]}>
            {isBusy ? 'Processing…' : confirmLabel}
          </Text>
        </Pressable>

        {/* Cancel */}
        <Pressable
          disabled={isBusy}
          {...androidRipple('rgba(239,68,68,0.14)')}
          style={({pressed}) => [
            s.cancelBtn,
            {borderColor: t.border, backgroundColor: t.altCard},
            isBusy ? s.primaryBtnDisabled : null,
            pressFX({pressed}),
          ]}
          onPress={() => {
            Alert.alert(
              'Cancel transaction?',
              'This will discard the current amount and tip.',
              [
                {text: 'No', style: 'cancel'},
                {
                  text: 'Yes, Cancel',
                  style: 'destructive',
                  onPress: () => onCancel?.(),
                },
              ],
            );
          }}>
          <Text style={[s.cancelText, {color: t.muted}]}>
            Cancel Transaction
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

  taxRow: {marginTop: 10},
  taxBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  taxText: {fontWeight: '900', fontSize: 13},

  intlRow: {marginTop: 10},
  intlBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  intlText: {fontWeight: '900', fontSize: 13},

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

  cancelBtn: {
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelText: {fontWeight: '900', fontSize: 13},

  note: {marginTop: 10, fontSize: 12, fontWeight: '700'},
});
