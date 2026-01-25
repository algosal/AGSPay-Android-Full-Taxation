// components/Terminal/TerminalScreen.jsx
import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, TouchableOpacity, Alert} from 'react-native';
import * as Keychain from 'react-native-keychain';

import terminalStyles, {AG} from './terminal.styles';

async function readAgpaySelection() {
  try {
    const creds = await Keychain.getInternetCredentials('agpaySelection');
    if (!creds?.password) return null;
    return JSON.parse(creds.password);
  } catch (e) {
    console.log('readAgpaySelection error:', e);
    return null;
  }
}

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function TerminalScreen({
  paymentNote,
  setPaymentNote,

  onBackToStoreSelect,
  onGoToTip,

  onConnectReader,
  onDisconnectReader,
  onChargeCard,

  readerStatus, // { connected: bool, label: string }
  isReaderBusy,

  // Optional: App.js can pass chargeData if you want to show totals here
  chargeData,
  onCashReceipt, // optional callback if you want cash receipts
}) {
  const s = terminalStyles;

  const [sel, setSel] = useState(null);

  useEffect(() => {
    (async () => {
      const selection = await readAgpaySelection();
      setSel(selection || null);
    })();
  }, []);

  const connected = !!readerStatus?.connected;

  const subtitle = useMemo(() => {
    const c = sel?.corporateName ? sel.corporateName : 'Corporate';
    const st = sel?.storeName ? sel.storeName : 'Store';
    return `${c} · ${st}`;
  }, [sel]);

  const statusLabel =
    readerStatus?.label ||
    (connected ? 'Tap to Pay connected' : 'Tap to Pay not connected');

  const totalCents = Number(chargeData?.totalCents || 0);
  const totalLabel =
    chargeData?.totalLabel || (totalCents ? centsToMoney(totalCents) : null);

  return (
    <View style={s.screen}>
      <View style={s.content}>
        <View style={s.card}>
          {/* Header */}
          <View style={s.headerRow}>
            <TouchableOpacity
              onPress={onBackToStoreSelect}
              style={s.connectChip}>
              <Text style={s.connectChipText}>Back</Text>
            </TouchableOpacity>

            <View style={{flex: 1, alignItems: 'center'}}>
              <View style={s.titleRow}>
                <Text style={s.titleAG}>AG</Text>
                <Text style={s.titlePay}>Pay</Text>
              </View>
              <Text style={s.subtitle}>{subtitle}</Text>
            </View>

            {/* Connect/Disconnect chip */}
            <TouchableOpacity
              onPress={async () => {
                if (isReaderBusy) return;

                try {
                  if (connected) {
                    await onDisconnectReader?.();
                  } else {
                    await onConnectReader?.();
                  }
                } catch (e) {
                  console.log('connect/disconnect error:', e);
                  Alert.alert('Terminal error', String(e?.message || e));
                }
              }}
              disabled={!!isReaderBusy}
              style={s.connectChip}>
              <Text style={s.connectChipText}>
                {connected ? (
                  <>
                    <Text style={s.connectChipTextGold}>CONNECTED</Text>
                  </>
                ) : (
                  'CONNECT'
                )}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Status */}
          <View style={s.dividerTop}>
            <View style={s.row}>
              <Text style={s.rowLabel}>Reader</Text>
              <Text style={s.rowValue}>{statusLabel}</Text>
            </View>

            {isReaderBusy ? (
              <Text style={[s.statusText, {marginTop: 8}]}>
                Working… please wait
              </Text>
            ) : null}
          </View>

          {/* Amount summary (optional) */}
          {totalLabel ? (
            <View style={s.bigAmountBox}>
              <Text style={s.bigAmount}>{totalLabel}</Text>
              <Text style={s.bigAmountSub}>Current total (from checkout)</Text>
            </View>
          ) : (
            <View style={s.bigAmountBox}>
              <Text style={s.bigAmount}>$0.00</Text>
              <Text style={s.bigAmountSub}>
                Enter amount to begin (Tip flow)
              </Text>
            </View>
          )}

          {/* Continue to amount/tip flow */}
          <TouchableOpacity onPress={() => onGoToTip?.()} style={s.primaryBtn}>
            <Text style={s.primaryBtnText}>Enter Amount</Text>
          </TouchableOpacity>

          {/* Payment action buttons */}
          <TouchableOpacity
            onPress={async () => {
              // CASH path: no Stripe. You can create a receipt in App.js.
              const amt = Number(chargeData?.totalCents || 0);

              if (!amt || amt < 1) {
                Alert.alert(
                  'No amount',
                  'Enter amount first (then Tip + Checkout) before completing cash.',
                );
                return;
              }

              if (typeof onCashReceipt !== 'function') {
                Alert.alert(
                  'Cash complete',
                  'Cash path is enabled, but onCashReceipt is not wired in App.js.',
                );
                return;
              }

              onCashReceipt();
            }}
            style={s.secondaryBtn}>
            <Text style={s.secondaryBtnText}>Complete as Cash</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={async () => {
              const amt = Number(chargeData?.totalCents || 0);

              if (!amt || amt < 1) {
                Alert.alert(
                  'No amount',
                  'Enter amount first (then Tip + Checkout) before charging card.',
                );
                return;
              }

              if (!connected) {
                Alert.alert('Reader not connected', 'Tap CONNECT first.');
                return;
              }

              if (typeof onChargeCard !== 'function') {
                Alert.alert(
                  'Missing wiring',
                  'onChargeCard not configured. Check App.js.',
                );
                return;
              }

              await onChargeCard();
            }}
            style={s.primaryBtn}>
            <Text style={s.primaryBtnText}>Charge Card (Tap to Pay)</Text>
          </TouchableOpacity>

          <Text style={[s.statusText, {marginTop: 10}]}>
            Card payments require Tap to Pay connection. Cash creates a local
            receipt only.
          </Text>
        </View>
      </View>
    </View>
  );
}
