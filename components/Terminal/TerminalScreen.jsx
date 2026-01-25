// FILE: components/Terminal/TerminalScreen.jsx
import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, Alert, Pressable} from 'react-native';
import * as Keychain from 'react-native-keychain';

import terminalStyles from './terminal.styles';

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
  onBackToStoreSelect,
  onGoToTip, // we will use this as "go to AMOUNT"

  onConnectReader,
  onDisconnectReader,

  readerStatus, // { connected: bool, label: string }
  isReaderBusy,

  chargeData,
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
    chargeData?.totalLabel || (totalCents ? centsToMoney(totalCents) : '$0.00');

  return (
    <View style={s.screen} pointerEvents="auto">
      <View style={s.content} pointerEvents="auto">
        <View style={s.card} pointerEvents="auto">
          {/* Header */}
          <View style={s.headerRow} pointerEvents="auto">
            <Pressable
              onPress={() => {
                console.log('✅ TERMINAL: Back pressed');
                onBackToStoreSelect?.();
              }}
              hitSlop={12}
              style={s.connectChip}>
              <Text style={s.connectChipText}>Back</Text>
            </Pressable>

            <View style={{flex: 1, alignItems: 'center'}} pointerEvents="none">
              <View style={s.titleRow}>
                <Text style={s.titleAG}>AG</Text>
                <Text style={s.titlePay}>Pay</Text>
              </View>
              <Text style={s.subtitle}>{subtitle}</Text>
            </View>

            {/* Connect/Disconnect chip */}
            <Pressable
              onPress={async () => {
                if (isReaderBusy) return;

                try {
                  console.log('✅ TERMINAL: Connect/Disconnect pressed');
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
              hitSlop={12}
              style={s.connectChip}>
              <Text style={s.connectChipText}>
                {connected ? (
                  <Text style={s.connectChipTextGold}>CONNECTED</Text>
                ) : (
                  'CONNECT'
                )}
              </Text>
            </Pressable>
          </View>

          {/* Status */}
          <View style={s.dividerTop} pointerEvents="none">
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

          {/* ✅ Tap-to-enter amount (no button) */}
          <Pressable
            onPress={() => {
              console.log('✅ TERMINAL: Amount box pressed -> NAV to AMOUNT');
              onGoToTip?.(); // App.js already maps this to go('AMOUNT')
            }}
            hitSlop={16}
            style={s.bigAmountBox}>
            <Text style={s.bigAmount}>{totalLabel}</Text>
            <Text style={s.bigAmountSub}>
              Tap amount to enter (then Tip → Payment Method → Receipt)
            </Text>
          </Pressable>

          {/* Helper text only */}
          <Text style={[s.statusText, {marginTop: 10}]} pointerEvents="none">
            Flow: Amount → Tip → Choose Cash/Card → Receipt
          </Text>
        </View>
      </View>
    </View>
  );
}
