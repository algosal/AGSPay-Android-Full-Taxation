// components/Checkout/CheckoutScreen.js
import React, {useMemo} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import styles from './checkout.styles';

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function CheckoutScreen({
  chargeData, // { subtotalCents, taxCents, albaFeeCents, totalCents }
  onBack, // go back to Terminal
  onConfirm, // run your existing payment logic (tap reader, collect payment, etc.)
  isBusy, // optional: disable confirm while processing
}) {
  const data = useMemo(() => {
    const d = chargeData || {};
    return {
      subtotalCents: Number(d.subtotalCents || 0),
      taxCents: Number(d.taxCents || 0),
      albaFeeCents: Number(d.albaFeeCents || 0),
      totalCents: Number(d.totalCents || 0),
    };
  }, [chargeData]);

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.card}>
          {/* HEADER WITH BACK */}
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Checkout</Text>

            {/* spacer to balance center title */}
            <View style={{width: 60}} />
          </View>

          {/* SUMMARY */}
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

            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.rowLabelTotal}>Total</Text>
              <Text style={styles.rowValueTotal}>
                {centsToMoney(data.totalCents)}
              </Text>
            </View>
          </View>

          {/* CONFIRM */}
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              isBusy ? styles.primaryBtnDisabled : null,
            ]}
            onPress={() => onConfirm?.(data)}
            disabled={!!isBusy}>
            <Text style={styles.primaryBtnText}>
              {isBusy ? 'Processing…' : 'Confirm Payment'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            Present / tap the card on the reader when prompted.
          </Text>
        </View>
      </View>
    </View>
  );
}
