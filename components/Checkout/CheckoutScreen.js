import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';

import terminalStyles, {AG} from '../Terminal/terminal.styles';
import PaymentTerminal from '../PaymentTerminal';

function dollarsFromCents(c) {
  const n = Number(c || 0);
  return (n / 100).toFixed(2);
}

export default function CheckoutScreen({
  method,
  currency = 'usd',
  paymentNote,
  corporateName,
  storeName,

  // ✅ REQUIRED breakdown
  subtotalCents,
  taxCents,
  albaFeeCents,
  tipCents,

  onPaid,
  onBack,
  onLogout,
}) {
  const s = terminalStyles;

  const paymentRef = useRef(null);
  const [starting, setStarting] = useState(false);
  const [didStart, setDidStart] = useState(false);

  const safeSubtotalCents = Number(subtotalCents || 0);
  const safeTaxCents = Number(taxCents || 0);
  const safeAlbaFeeCents = Number(albaFeeCents || 0);
  const safeTipCents = Number(tipCents || 0);

  // ✅ FINAL amount charged
  const grandTotalCents =
    safeSubtotalCents + safeTaxCents + safeAlbaFeeCents + safeTipCents;

  const totalLabel = `$${dollarsFromCents(grandTotalCents)}`;

  const breakdown = useMemo(() => {
    return {
      subtotalCents: safeSubtotalCents,
      taxCents: safeTaxCents,
      albaFeeCents: safeAlbaFeeCents,
      tipCents: safeTipCents,
      totalCents: grandTotalCents,
      totalLabel,
    };
  }, [
    safeSubtotalCents,
    safeTaxCents,
    safeAlbaFeeCents,
    safeTipCents,
    grandTotalCents,
    totalLabel,
  ]);

  // CASH: mark paid + go receipt
  useEffect(() => {
    if (didStart) return;
    if (String(method || '').toUpperCase() !== 'CASH') return;

    setDidStart(true);

    const receiptPayload = {
      currency,
      paymentMethod: 'CASH',
      createdAtText: new Date().toLocaleString(),
      note: paymentNote || '',
      corporateName: corporateName || '',
      storeName: storeName || '',

      subtotalCents: safeSubtotalCents,
      taxCents: safeTaxCents,
      albaFeeCents: safeAlbaFeeCents,
      tipCents: safeTipCents,
      totalCents: grandTotalCents,
      grandTotalCents: grandTotalCents,

      amountCents: grandTotalCents,
      amountText: totalLabel,
    };

    onPaid?.(receiptPayload);
  }, [
    didStart,
    method,
    currency,
    paymentNote,
    corporateName,
    storeName,
    safeSubtotalCents,
    safeTaxCents,
    safeAlbaFeeCents,
    safeTipCents,
    grandTotalCents,
    totalLabel,
    onPaid,
  ]);

  // CARD: auto start once
  useEffect(() => {
    if (didStart) return;
    if (String(method || '').toUpperCase() !== 'CARD') return;

    if (!Number.isFinite(grandTotalCents) || grandTotalCents <= 0) {
      Alert.alert('Invalid total', 'Total must be > $0.00');
      return;
    }

    setDidStart(true);
    setStarting(true);

    setTimeout(() => {
      try {
        paymentRef.current?.startCardPayment?.();
      } catch (e) {
        console.log('startCardPayment call error:', e);
        Alert.alert('Error', String(e?.message || e));
      } finally {
        setStarting(false);
      }
    }, 200);
  }, [didStart, method, grandTotalCents]);

  const handlePaymentSuccess = receiptPayload => {
    const merged = {
      ...receiptPayload,

      currency,
      corporateName: receiptPayload?.corporateName || corporateName || '',
      storeName: receiptPayload?.storeName || storeName || '',
      note: receiptPayload?.note ?? paymentNote ?? '',

      subtotalCents: safeSubtotalCents,
      taxCents: safeTaxCents,
      albaFeeCents: safeAlbaFeeCents,
      tipCents: safeTipCents,

      totalCents: grandTotalCents,
      grandTotalCents: grandTotalCents,

      amountCents: grandTotalCents,
      amountText: totalLabel,
    };

    onPaid?.(merged);
  };

  return (
    <View style={[s.screen, {padding: 16}]}>
      <View style={s.headerRow}>
        <Text style={[s.title, {fontSize: 22}]}>
          <Text style={{color: AG.gold}}>AG</Text>
          <Text style={{color: AG.text}}>Pay · Checkout</Text>
        </Text>

        <View style={{flexDirection: 'row', gap: 10}}>
          {typeof onBack === 'function' && (
            <TouchableOpacity onPress={onBack} style={s.logoutBtn}>
              <Text style={s.logoutIcon}>←</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
            <Text style={s.logoutIcon}>⎋</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.card}>
        <Text style={[s.cardTitle, {fontSize: 18}]}>Order Summary</Text>

        <View style={[s.row, {marginTop: 12}]}>
          <Text style={[s.rowLabel, {fontSize: 14}]}>Subtotal</Text>
          <Text style={[s.rowValue, {fontSize: 14}]}>
            ${dollarsFromCents(safeSubtotalCents)}
          </Text>
        </View>

        <View style={s.row}>
          <Text style={[s.rowLabel, {fontSize: 14}]}>Tax</Text>
          <Text style={[s.rowValue, {fontSize: 14}]}>
            ${dollarsFromCents(safeTaxCents)}
          </Text>
        </View>

        <View style={s.row}>
          <Text style={[s.rowLabel, {fontSize: 14}]}>Alba Fee</Text>
          <Text style={[s.rowValue, {fontSize: 14}]}>
            ${dollarsFromCents(safeAlbaFeeCents)}
          </Text>
        </View>

        <View style={s.row}>
          <Text style={[s.rowLabel, {fontSize: 14}]}>Tip</Text>
          <Text style={[s.rowValue, {fontSize: 14}]}>
            ${dollarsFromCents(safeTipCents)}
          </Text>
        </View>

        <View style={[s.row, {marginTop: 10, alignItems: 'flex-end'}]}>
          <Text style={[s.rowLabel, {fontWeight: '900', fontSize: 16}]}>
            Total
          </Text>
          <Text style={[s.rowValueGold, {fontSize: 30, fontWeight: '900'}]}>
            {totalLabel}
          </Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={[s.cardTitle, {fontSize: 18}]}>Payment</Text>

        <Text style={[s.statusText, {fontSize: 14}]}>
          Method: {String(method || '').toUpperCase()}
        </Text>

        {String(method || '').toUpperCase() === 'CARD' && (
          <>
            {starting && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 10,
                }}>
                <ActivityIndicator size="small" />
                <Text style={[s.statusText, {fontSize: 14}]}>
                  Starting card payment…
                </Text>
              </View>
            )}

            <PaymentTerminal
              ref={paymentRef}
              amountCents={grandTotalCents} // ✅ Stripe charges THIS
              amountLabel={totalLabel}
              currency={currency}
              debugMeta={{note: paymentNote || ''}}
              breakdown={breakdown} // ✅ receipt uses this
              onPaymentSuccess={handlePaymentSuccess}
            />
          </>
        )}

        {String(method || '').toUpperCase() === 'CASH' && (
          <Text style={[s.statusText, {fontSize: 14, marginTop: 10}]}>
            Cash marked as paid.
          </Text>
        )}
      </View>
    </View>
  );
}
