// components/Checkout/CheckoutScreen.js
import React, {useMemo} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import styles from './checkout.styles';

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function CheckoutScreen({
  chargeData,
  onBack,
  onConfirm,
  isBusy,
}) {
  const data = useMemo(() => {
    const d = chargeData || {};
    const method = String(d.method || 'CARD').toUpperCase();

    const subtotalCents = Number(d.subtotalCents || 0);
    const taxCents = Number(d.taxCents || 0);
    const albaFeeCents = Number(d.albaFeeCents || 0);
    const tipCents = Number(d.tipCents || 0);

    const totalCents = Number(d.totalCents ?? d.grandTotalCents ?? 0);

    return {
      method,
      currency: d.currency || 'usd',
      paymentNote: d.paymentNote || '',

      subtotalCents,
      taxCents,
      albaFeeCents,
      tipCents,
      totalCents,

      totalLabel: d.totalLabel || centsToMoney(totalCents),
    };
  }, [chargeData]);

  const confirmLabel =
    data.method === 'CASH' ? 'Confirm Cash Payment' : 'Confirm Card Payment';

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

          <View style={styles.summaryBox}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Method</Text>
              <Text style={styles.rowValue}>{data.method}</Text>
            </View>

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
            onPress={() => onConfirm?.(data)}
            disabled={!!isBusy}>
            <Text style={styles.primaryBtnText}>
              {isBusy ? 'Processing…' : confirmLabel}
            </Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            {data.method === 'CASH'
              ? 'Confirm you received cash, then proceed to receipt.'
              : 'Present / tap the card on the reader when prompted.'}
          </Text>
        </View>
      </View>
    </View>
  );
}
