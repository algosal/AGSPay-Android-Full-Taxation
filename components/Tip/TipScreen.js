import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';

import terminalStyles, {AG} from '../Terminal/terminal.styles';

function dollarsFromCents(cents) {
  const n = Number(cents || 0);
  return (n / 100).toFixed(2);
}

function parseMoneyToCents(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return 0;
  const n = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export default function TipScreen({
  // ✅ NEW (preferred): explicit breakdown coming from TerminalScreen
  subtotalCents,
  taxCents,
  albaFeeCents,
  baseTotalCents,
  baseTotalLabel,

  // ✅ BACKWARD COMPAT: if older code still passes these, we’ll fall back safely
  baseAmountCents,
  baseAmountLabel,

  currency = 'usd',
  paymentNote,
  corporateName,
  storeName,
  onBack,

  // onDone({ method, tipCents, grandTotalCents, ... + breakdown })
  onDone,
}) {
  const s = terminalStyles;

  const [selectedTipCents, setSelectedTipCents] = useState(0);
  const [customTipInput, setCustomTipInput] = useState('');

  const presets = useMemo(() => {
    return [
      {label: '$1', cents: 100},
      {label: '$2', cents: 200},
      {label: '$3', cents: 300},
      {label: '$5', cents: 500},
      {label: '$10', cents: 1000},
    ];
  }, []);

  // ✅ Choose correct base (prefer baseTotalCents, fallback to baseAmountCents)
  const base =
    Number.isFinite(Number(baseTotalCents)) && Number(baseTotalCents) > 0
      ? Number(baseTotalCents)
      : Number(baseAmountCents || 0);

  const shownBaseLabel =
    baseTotalLabel || baseAmountLabel || `$${dollarsFromCents(base)}`;

  const safeSubtotalCents = Number.isFinite(Number(subtotalCents))
    ? Number(subtotalCents)
    : null;

  const safeTaxCents = Number.isFinite(Number(taxCents)) ? Number(taxCents) : 0;

  const safeAlbaFeeCents = Number.isFinite(Number(albaFeeCents))
    ? Number(albaFeeCents)
    : 0;

  const customTipCents = useMemo(
    () => parseMoneyToCents(customTipInput),
    [customTipInput],
  );

  const effectiveTipCents = useMemo(() => {
    const rawCustom = String(customTipInput ?? '').trim();
    if (rawCustom.length > 0) return customTipCents;
    return Number(selectedTipCents || 0);
  }, [customTipInput, customTipCents, selectedTipCents]);

  const grandTotalCents = base + effectiveTipCents;

  const tipLabel = `$${dollarsFromCents(effectiveTipCents)}`;
  const grandTotalLabel = `$${dollarsFromCents(grandTotalCents)}`;

  const finish = method => {
    if (base <= 0) {
      Alert.alert('Invalid amount', 'Base total must be greater than $0.00.');
      return;
    }
    if (effectiveTipCents < 0) {
      Alert.alert('Invalid tip', 'Tip cannot be negative.');
      return;
    }
    if (typeof onDone === 'function') {
      onDone({
        method, // CASH or CARD
        currency,

        // ✅ tip
        tipCents: effectiveTipCents,
        tipLabel,

        // ✅ totals
        baseTotalCents: base,
        baseTotalLabel: shownBaseLabel,
        grandTotalCents,
        grandTotalLabel,

        // ✅ CRITICAL: carry breakdown forward so Checkout/Receipt/Stripe use it
        subtotalCents: safeSubtotalCents, // can be null if older flow
        taxCents: safeTaxCents,
        albaFeeCents: safeAlbaFeeCents,
      });
    } else {
      Alert.alert('Missing route', 'onDone is not configured.');
    }
  };

  const clearCustom = () => setCustomTipInput('');

  return (
    <KeyboardAvoidingView
      style={{flex: 1, backgroundColor: AG.bg}}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.screen} contentContainerStyle={s.content}>
        <View style={s.headerRow}>
          <Text style={[s.title, {fontSize: 22}]}>
            <Text style={{color: AG.gold}}>AG</Text>
            <Text style={{color: AG.text}}>Pay · Tip</Text>
          </Text>

          <View style={{flexDirection: 'row', gap: 10}}>
            {typeof onBack === 'function' && (
              <TouchableOpacity onPress={onBack} style={s.logoutBtn}>
                <Text style={s.logoutIcon}>←</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={[s.subtitle, {fontSize: 15}]}>
          Add a tip before payment
        </Text>

        <View style={s.card}>
          <Text style={[s.cardTitle, {fontSize: 18}]}>Order Summary</Text>

          {!!corporateName && (
            <Text style={[s.statusText, {fontSize: 14}]}>{corporateName}</Text>
          )}
          {!!storeName && (
            <Text style={[s.statusText, {fontSize: 14}]}>
              Store: {storeName}
            </Text>
          )}
          {!!paymentNote && (
            <Text style={[s.statusText, {fontSize: 14}]}>
              Note: {paymentNote}
            </Text>
          )}

          <View style={[s.row, {marginTop: 12}]}>
            <Text style={[s.rowLabel, {fontSize: 14}]}>Base total</Text>
            <Text style={[s.rowValue, {fontSize: 14}]}>{shownBaseLabel}</Text>
          </View>

          <View style={s.row}>
            <Text style={[s.rowLabel, {fontSize: 14}]}>Tip</Text>
            <Text style={[s.rowValue, {fontSize: 14}]}>{tipLabel}</Text>
          </View>

          <View style={[s.row, {marginTop: 10, alignItems: 'flex-end'}]}>
            <Text style={[s.rowLabel, {fontWeight: '900', fontSize: 16}]}>
              Grand total
            </Text>
            <Text style={[s.rowValueGold, {fontSize: 30, fontWeight: '900'}]}>
              {grandTotalLabel}
            </Text>
          </View>

          <View style={{marginTop: 10}}>
            {safeSubtotalCents !== null && (
              <Text style={[s.statusText, {fontSize: 12}]}>
                Subtotal: ${dollarsFromCents(safeSubtotalCents)}
              </Text>
            )}
            <Text style={[s.statusText, {fontSize: 12}]}>
              Tax: ${dollarsFromCents(safeTaxCents)}
            </Text>
            <Text style={[s.statusText, {fontSize: 12}]}>
              Alba Fee: ${dollarsFromCents(safeAlbaFeeCents)}
            </Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={[s.cardTitle, {fontSize: 18}]}>Choose Tip</Text>

          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
            {presets.map(p => {
              const isSelected =
                String(customTipInput ?? '').trim().length === 0 &&
                selectedTipCents === p.cents;

              return (
                <TouchableOpacity
                  key={p.label}
                  onPress={() => {
                    setSelectedTipCents(p.cents);
                    setCustomTipInput('');
                  }}
                  style={[
                    s.secondaryBtn,
                    {
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderWidth: 1,
                      borderColor: isSelected ? AG.gold : AG.border,
                      backgroundColor: isSelected ? AG.inputBg : 'transparent',
                    },
                  ]}>
                  <Text
                    style={[
                      s.secondaryBtnText,
                      {fontSize: 16, color: isSelected ? AG.gold : AG.text},
                    ]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{marginTop: 16}}>
            <Text style={[s.statusText, {fontSize: 14, marginBottom: 8}]}>
              Or enter custom tip
            </Text>

            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
              <Text style={{color: AG.text, fontSize: 22, fontWeight: '900'}}>
                $
              </Text>

              <TextInput
                style={[
                  s.amountInput,
                  {fontSize: 22, flex: 1, paddingVertical: 10},
                ]}
                keyboardType="numeric"
                value={customTipInput}
                onChangeText={setCustomTipInput}
                placeholder="0.00"
                placeholderTextColor={AG.muted}
              />

              <TouchableOpacity onPress={clearCustom} style={s.logoutBtn}>
                <Text style={s.logoutIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[s.statusText, {fontSize: 12, marginTop: 8}]}>
              Custom tip overrides preset selection.
            </Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={[s.cardTitle, {fontSize: 18}]}>Pay Now</Text>

          <View style={{flexDirection: 'row', gap: 10, marginTop: 10}}>
            <TouchableOpacity
              onPress={() => finish('CASH')}
              style={[
                s.primaryBtn,
                {flex: 1, marginTop: 0, backgroundColor: '#16a34a'},
              ]}>
              <Text style={[s.primaryBtnText, {color: '#fff', fontSize: 16}]}>
                Pay Cash
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => finish('CARD')}
              style={[
                s.primaryBtn,
                {flex: 1, marginTop: 0, backgroundColor: AG.gold},
              ]}>
              <Text
                style={[s.primaryBtnText, {color: AG.goldText, fontSize: 16}]}>
                Pay Card
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[s.statusText, {fontSize: 12, marginTop: 10}]}>
            Next screen runs the payment automatically.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
