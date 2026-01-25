// FILE: components/Checkout/CheckoutScreen.js
import React, {useMemo, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function CheckoutScreen({
  chargeData,
  onBack,

  // ✅ split confirm paths
  onCashConfirm,
  onCardConfirm,

  isBusy,
}) {
  const data = useMemo(() => {
    const d = chargeData || {};

    const subtotalCents = Number(d.subtotalCents || 0);
    const taxCents = Number(d.taxCents || 0);
    const albaFeeCents = Number(d.albaFeeCents || 0);
    const tipCents = Number(d.tipCents || 0);
    const totalCents = Number(d.totalCents ?? d.grandTotalCents ?? 0);

    return {
      currency: d.currency || 'usd',
      paymentNote: d.paymentNote || '',

      subtotalCents,
      taxCents,
      albaFeeCents,
      tipCents,
      totalCents,
      totalLabel: d.totalLabel || centsToMoney(totalCents),

      raw: d,
    };
  }, [chargeData]);

  // ✅ default method (employee can switch)
  const [method, setMethod] = useState(() => {
    const m = String(chargeData?.method || 'CASH').toUpperCase();
    return m === 'CARD' ? 'CARD' : 'CASH';
  });

  const confirmLabel =
    method === 'CASH' ? 'Complete Cash → Receipt' : 'Card → Terminal';

  return (
    <View style={s.root}>
      <View style={s.card}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>

          <Text style={s.title}>Checkout</Text>

          <View style={{width: 60}} />
        </View>

        {/* ✅ PAYMENT METHOD PICKER (this is what you need to see) */}
        <Text style={s.sectionLabel}>Payment Method</Text>
        <View style={s.methodRow}>
          <TouchableOpacity
            onPress={() => setMethod('CASH')}
            style={[s.methodBtn, method === 'CASH' ? s.methodBtnActive : null]}>
            <Text
              style={[
                s.methodText,
                method === 'CASH' ? s.methodTextActive : null,
              ]}>
              CASH
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMethod('CARD')}
            style={[s.methodBtn, method === 'CARD' ? s.methodBtnActive : null]}>
            <Text
              style={[
                s.methodText,
                method === 'CARD' ? s.methodTextActive : null,
              ]}>
              CARD
            </Text>
          </TouchableOpacity>
        </View>

        {/* ✅ SUMMARY */}
        <View style={s.summaryBox}>
          <Row label="Subtotal" value={centsToMoney(data.subtotalCents)} />
          <Row label="Sales Tax" value={centsToMoney(data.taxCents)} />
          <Row label="Service Fee" value={centsToMoney(data.albaFeeCents)} />
          <Row label="Tip" value={centsToMoney(data.tipCents)} />

          <View style={s.divider} />

          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL</Text>
            <Text style={s.totalValue}>{centsToMoney(data.totalCents)}</Text>
          </View>
        </View>

        {/* ✅ CONFIRM */}
        <TouchableOpacity
          disabled={!!isBusy}
          style={[s.primaryBtn, isBusy ? s.primaryBtnDisabled : null]}
          onPress={() => {
            const next = {
              ...(data.raw || {}),
              method,
              totalCents: data.totalCents,
              totalLabel: data.totalLabel,
            };

            if (method === 'CASH') {
              onCashConfirm?.(next);
              return;
            }

            onCardConfirm?.(next);
          }}>
          <Text style={s.primaryText}>
            {isBusy ? 'Processing…' : confirmLabel}
          </Text>
        </TouchableOpacity>

        <Text style={s.note}>
          {method === 'CASH'
            ? 'Use CASH now to verify it navigates to the Receipt print screen.'
            : 'CARD will route to Terminal (Stripe reader requires Android build config).'}
        </Text>
      </View>
    </View>
  );
}

function Row({label, value}) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const GOLD = '#d4af37';

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020617',
    padding: 16,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#050814',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1f2937',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {color: '#fff', fontSize: 20, fontWeight: '900'},

  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
  },
  backText: {color: '#fff', fontSize: 13, fontWeight: '900'},

  sectionLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 6,
  },

  methodRow: {flexDirection: 'row', gap: 10, marginTop: 10},
  methodBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  methodBtnActive: {
    borderColor: GOLD,
    backgroundColor: '#0b1222',
  },
  methodText: {color: '#fff', fontWeight: '900'},
  methodTextActive: {color: GOLD},

  summaryBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#0b1222',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: {color: '#9ca3af', fontWeight: '800'},
  rowValue: {color: '#fff', fontWeight: '900'},

  divider: {height: 1, backgroundColor: '#1f2937', marginVertical: 10},

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {color: '#fff', fontWeight: '900', letterSpacing: 1},
  totalValue: {color: '#fff', fontWeight: '900', fontSize: 18},

  primaryBtn: {
    marginTop: 14,
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: {opacity: 0.6},
  primaryText: {color: '#020617', fontWeight: '900', fontSize: 15},

  note: {marginTop: 10, color: '#9ca3af', fontSize: 12, fontWeight: '700'},
});
