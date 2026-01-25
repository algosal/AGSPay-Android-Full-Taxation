// FILE: components/Checkout/CheckoutScreen.js
import React, {useMemo, useState} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import styles from './checkout.styles';

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function CheckoutScreen({
  chargeData,
  onBack,

  // ✅ NEW: split confirm paths
  onCashConfirm, // should create receipt + navigate to RECEIPT
  onCardConfirm, // should proceed to card flow (Terminal charge, or whatever you use)

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

      // preserve breakdown fields (so App.js can store them)
      raw: d,
    };
  }, [chargeData]);

  // ✅ Employee chooses payment method here
  const [method, setMethod] = useState(() => {
    const m = String(chargeData?.method || 'CARD').toUpperCase();
    return m === 'CASH' ? 'CASH' : 'CARD';
  });

  const confirmLabel = method === 'CASH' ? 'Complete Cash' : 'Charge Card';

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Checkout</Text>

            <View style={{width: 60}} />
          </View>

          {/* ✅ Payment method selection */}
          <View style={{marginTop: 10}}>
            <Text style={styles.rowLabel}>Payment Method</Text>

            <View style={{flexDirection: 'row', marginTop: 8}}>
              <TouchableOpacity
                onPress={() => setMethod('CARD')}
                style={[
                  styles.secondaryBtn,
                  {flex: 1, marginTop: 0, marginRight: 8},
                  method === 'CARD' ? {borderColor: '#d4af37'} : null,
                ]}>
                <Text style={styles.secondaryBtnText}>Card</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setMethod('CASH')}
                style={[
                  styles.secondaryBtn,
                  {flex: 1, marginTop: 0},
                  method === 'CASH' ? {borderColor: '#d4af37'} : null,
                ]}>
                <Text style={styles.secondaryBtnText}>Cash</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.summaryBox}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Subtotal</Text>
              <Text style={styles.rowValue}>
                {centsToMoney(data.subtotalCents)}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Sales Tax</Text>
              <Text style={styles.rowValue}>{centsToMoney(data.taxCents)}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Service Fee</Text>
              <Text style={styles.rowValue}>
                {centsToMoney(data.albaFeeCents)}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Tip</Text>
              <Text style={styles.rowValue}>{centsToMoney(data.tipCents)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.rowLabelTotal}>Total</Text>
              <Text style={styles.rowValueTotal}>
                {centsToMoney(data.totalCents)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              isBusy ? styles.primaryBtnDisabled : null,
            ]}
            onPress={() => {
              // ✅ Build updated chargeData with method
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
            }}
            disabled={!!isBusy}>
            <Text style={styles.primaryBtnText}>
              {isBusy ? 'Processing…' : confirmLabel}
            </Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            {method === 'CASH'
              ? 'Confirm you received cash to print the receipt.'
              : 'Continue to card payment and then print the receipt.'}
          </Text>
        </View>
      </View>
    </View>
  );
}
