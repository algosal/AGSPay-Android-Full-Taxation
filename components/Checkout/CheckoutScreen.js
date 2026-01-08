import React, {useEffect, useRef} from 'react';
import {View, Text, Alert, ScrollView} from 'react-native';

import terminalStyles, {AG} from '../Terminal/terminal.styles';
import PaymentTerminal from '../PaymentTerminal.js';

function dollarsFromCents(cents) {
  const n = Number(cents || 0);
  return (n / 100).toFixed(2);
}

export default function CheckoutScreen({
  // REQUIRED
  method, // 'CARD' | 'CASH'
  baseAmountCents,
  tipCents,
  currency = 'usd',
  paymentNote,

  // optional display
  corporateName,
  storeName,

  // callbacks
  onPaid, // receipt payload -> App routes to receipt
  onBack, // optional back to tip
}) {
  const s = terminalStyles;
  const terminalRef = useRef(null);

  const base = Number(baseAmountCents || 0);
  const tip = Number(tipCents || 0);
  const grandTotalCents = base + tip;
  const grandTotalLabel = `$${dollarsFromCents(grandTotalCents)}`;

  // Auto-run checkout on mount
  useEffect(() => {
    if (!method) {
      Alert.alert('Missing method', 'No payment method was selected.');
      return;
    }

    if (grandTotalCents <= 0) {
      Alert.alert('Invalid total', 'Total must be greater than $0.00.');
      return;
    }

    if (method === 'CASH') {
      Alert.alert(
        'Cash payment',
        `Confirm cash payment for:\n\nGrand total: ${grandTotalLabel}`,
        [
          {text: 'Cancel', style: 'cancel', onPress: () => onBack?.()},
          {
            text: 'Confirm',
            style: 'default',
            onPress: () => {
              const receiptPayload = {
                amountText: grandTotalLabel,
                amountCents: grandTotalCents,
                currency,
                paymentNote: paymentNote || '',
                tipCents: tip,
                createdAtText: new Date().toLocaleString(),
                paymentId: `cash_${Date.now()}`,
                chargeId: null,
                brand: 'CASH',
                last4: null,
                paymentMethod: 'CASH',
                corporateName: corporateName || '',
                storeName: storeName || '',
              };

              if (typeof onPaid === 'function') onPaid(receiptPayload);
            },
          },
        ],
        {cancelable: true},
      );

      return;
    }

    // CARD auto-start
    const t = setTimeout(() => {
      terminalRef.current?.startCardPayment?.();
    }, 250);

    return () => clearTimeout(t);
  }, [
    method,
    grandTotalCents,
    grandTotalLabel,
    currency,
    paymentNote,
    tip,
    corporateName,
    storeName,
    onPaid,
    onBack,
  ]);

  const handleCardSuccess = receiptFromPaymentTerminal => {
    if (typeof onPaid === 'function') onPaid(receiptFromPaymentTerminal);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={[s.cardTitle, {fontSize: 18}]}>Checkout</Text>

        {!!corporateName && (
          <Text style={[s.statusText, {fontSize: 14}]}>{corporateName}</Text>
        )}
        {!!storeName && (
          <Text style={[s.statusText, {fontSize: 14}]}>Store: {storeName}</Text>
        )}
        {!!paymentNote && (
          <Text style={[s.statusText, {fontSize: 14}]}>
            Note: {paymentNote}
          </Text>
        )}

        <View style={[s.row, {marginTop: 12}]}>
          <Text style={[s.rowLabel, {fontSize: 14}]}>Base</Text>
          <Text style={[s.rowValue, {fontSize: 14}]}>
            ${dollarsFromCents(base)}
          </Text>
        </View>

        <View style={s.row}>
          <Text style={[s.rowLabel, {fontSize: 14}]}>Tip</Text>
          <Text style={[s.rowValue, {fontSize: 14}]}>
            ${dollarsFromCents(tip)}
          </Text>
        </View>

        <View style={[s.row, {marginTop: 10, alignItems: 'flex-end'}]}>
          <Text style={[s.rowLabel, {fontWeight: '900', fontSize: 16}]}>
            Total
          </Text>
          <Text style={[s.rowValueGold, {fontSize: 30, fontWeight: '900'}]}>
            {grandTotalLabel}
          </Text>
        </View>

        <Text style={[s.statusText, {marginTop: 10, fontSize: 12}]}>
          Method: {method === 'CARD' ? 'Card (Tap to Pay)' : 'Cash'}
        </Text>
      </View>

      {/* CARD flow runner */}
      {method === 'CARD' ? (
        <View style={s.card}>
          <Text style={[s.cardTitle, {fontSize: 18}]}>Card Payment</Text>
          <Text style={[s.statusText, {fontSize: 12}]}>
            Tap a card on the phone to pay.
          </Text>

          <PaymentTerminal
            ref={terminalRef}
            amountCents={grandTotalCents}
            amountLabel={grandTotalLabel}
            currency={currency}
            debugMeta={{
              tipCents: tip,
              note: paymentNote || '',
              from: 'CheckoutScreen',
            }}
            theme={{text: AG.text, muted: AG.muted, danger: AG.danger}}
            onPaymentSuccess={handleCardSuccess}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
