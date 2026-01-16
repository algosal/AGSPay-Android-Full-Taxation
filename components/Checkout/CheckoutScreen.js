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
  method, // 'CASH' | 'CARD'
  currency = 'usd',
  paymentNote,
  corporateName,
  storeName,

  // expected inputs from tip screen
  baseAmountCents, // SUBTOTAL
  tipCents,

  grandTotalCents, // optional legacy
  grandTotalLabel, // optional legacy

  onPaid,
  onBack,
  onLogout,
}) {
  const s = terminalStyles;
  const paymentRef = useRef(null);

  const [starting, setStarting] = useState(false);
  const [didStart, setDidStart] = useState(false);

  // If you still pass grandTotalCents, we trust it; otherwise compute from base+tip only.
  // (Your fee/tax logic lives elsewhere; the important part is: breakdown passed through.)
  const totalCents = Number(
    grandTotalCents ?? Number(baseAmountCents || 0) + Number(tipCents || 0),
  );
  const totalLabel = grandTotalLabel || `$${dollarsFromCents(totalCents)}`;

  const breakdown = useMemo(() => {
    return {
      subtotalCents: Number(baseAmountCents || 0),
      tipCents: Number(tipCents || 0),

      // If you have these available in props, pass them too:
      taxCents: Number(0),
      albaFeeCents: Number(0),
      stripeFeeCents: Number(0),

      totalCents: totalCents,
      totalLabel: totalLabel,
    };
  }, [baseAmountCents, tipCents, totalCents, totalLabel]);

  // CASH
  useEffect(() => {
    if (didStart) return;
    if (String(method || '').toUpperCase() !== 'CASH') return;

    setDidStart(true);

    const receiptPayload = {
      amountText: totalLabel,
      amountCents: totalCents,
      currency,
      brand: null,
      last4: null,
      paymentId: null,
      chargeId: null,
      note: paymentNote || '',
      corporateName: corporateName || '',
      storeName: storeName || '',
      createdAtText: new Date().toLocaleString(),
      paymentMethod: 'CASH',

      // breakdown fields for printing
      subtotalCents: breakdown.subtotalCents,
      tipCents: breakdown.tipCents,
      taxCents: breakdown.taxCents,
      albaFeeCents: breakdown.albaFeeCents,
      stripeFeeCents: breakdown.stripeFeeCents,
      totalCents: breakdown.totalCents,
    };

    onPaid?.(receiptPayload);
  }, [
    didStart,
    method,
    totalLabel,
    totalCents,
    currency,
    paymentNote,
    corporateName,
    storeName,
    onPaid,
    breakdown,
  ]);

  // CARD
  useEffect(() => {
    if (didStart) return;
    if (String(method || '').toUpperCase() !== 'CARD') return;

    if (!Number.isFinite(totalCents) || totalCents <= 0) {
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
  }, [didStart, method, totalCents]);

  const handlePaymentSuccess = receiptPayload => {
    const merged = {
      ...receiptPayload,

      // harden totals
      amountText: receiptPayload?.amountText || totalLabel,
      amountCents: Number(receiptPayload?.amountCents || totalCents),
      totalCents: Number(receiptPayload?.totalCents || totalCents),

      corporateName: receiptPayload?.corporateName || corporateName || '',
      storeName: receiptPayload?.storeName || storeName || '',
      note: receiptPayload?.note ?? paymentNote ?? '',

      // ensure breakdown exists for print even if PaymentTerminal didn't supply (it does now)
      subtotalCents: Number(
        receiptPayload?.subtotalCents ?? breakdown.subtotalCents ?? 0,
      ),
      taxCents: Number(receiptPayload?.taxCents ?? breakdown.taxCents ?? 0),
      albaFeeCents: Number(
        receiptPayload?.albaFeeCents ?? breakdown.albaFeeCents ?? 0,
      ),
      stripeFeeCents: Number(
        receiptPayload?.stripeFeeCents ?? breakdown.stripeFeeCents ?? 0,
      ),
      tipCents: Number(receiptPayload?.tipCents ?? breakdown.tipCents ?? 0),
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
              amountCents={totalCents}
              amountLabel={totalLabel}
              currency={currency}
              debugMeta={{note: paymentNote || ''}}
              breakdown={breakdown}
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
