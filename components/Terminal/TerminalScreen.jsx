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
  onGoToTip,
  onConnectReader,
  onDisconnectReader,
  readerStatus,
  isReaderBusy,
  chargeData,

  // ✅ OPTIONAL: if you wire this from App.js (see note below)
  terminalStatusLine,

  // ✅ ADDED: theme comes from App.js (no logic change)
  theme,
}) {
  const s = terminalStyles;
  const [sel, setSel] = useState(null);

  /**
   * ✅ ADDED: theme palette (colors only)
   * Why: terminal.styles likely hardcodes colors. This layer overrides ONLY colors
   * while keeping your spacing/layout/typography intact.
   */
  const t = useMemo(() => {
    return {
      bg: theme?.bg ?? '#020617',
      card: theme?.card ?? '#050814',
      inputBg: theme?.inputBg ?? '#0b1222',
      text: theme?.text ?? '#ffffff',
      muted: theme?.muted ?? '#9ca3af',
      border: theme?.border ?? '#1f2937',
      gold: theme?.gold ?? '#d4af37',
      goldText: theme?.goldText ?? '#020617',
      danger: theme?.danger ?? '#ef4444',
    };
  }, [theme]);

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

  // ✅ what to show as the “big status”
  const bigStatus = terminalStatusLine || (isReaderBusy ? 'Working…' : '');

  return (
    // ✅ CHANGED: apply themed bg without touching terminal.styles layout
    <View style={[s.screen, {backgroundColor: t.bg}]} pointerEvents="auto">
      <View style={s.content} pointerEvents="auto">
        {/* ✅ CHANGED: apply themed card/bg/border */}
        <View
          style={[
            s.card,
            {
              backgroundColor: t.card,
              borderColor: t.border,
            },
          ]}
          pointerEvents="auto">
          <View style={s.headerRow} pointerEvents="auto">
            {/* Back */}
            <Pressable
              onPress={() => onBackToStoreSelect?.()}
              hitSlop={12}
              style={[
                s.connectChip,
                {
                  backgroundColor: t.inputBg, // ✅ theme-based chip bg
                  borderColor: t.border, // ✅ theme-based border
                },
              ]}>
              <Text style={[s.connectChipText, {color: t.text}]}>Back</Text>
            </Pressable>

            {/* Title */}
            <View style={{flex: 1, alignItems: 'center'}} pointerEvents="none">
              <View style={s.titleRow}>
                <Text style={[s.titleAG, {color: t.text}]}>AG</Text>
                <Text style={[s.titlePay, {color: t.gold}]}>Pay</Text>
              </View>
              <Text style={[s.subtitle, {color: t.muted}]}>{subtitle}</Text>
            </View>

            {/* Connect / Connected */}
            <Pressable
              onPress={async () => {
                if (isReaderBusy) return;
                try {
                  if (connected) await onDisconnectReader?.();
                  else await onConnectReader?.();
                } catch (e) {
                  Alert.alert('Terminal error', String(e?.message || e));
                }
              }}
              hitSlop={12}
              style={[
                s.connectChip,
                {
                  backgroundColor: t.inputBg, // ✅ theme-based chip bg
                  borderColor: t.border, // ✅ theme-based border
                },
              ]}>
              <Text style={[s.connectChipText, {color: t.text}]}>
                {connected ? (
                  // ✅ CHANGED: gold color from theme
                  <Text style={[s.connectChipTextGold, {color: t.gold}]}>
                    CONNECTED
                  </Text>
                ) : (
                  'CONNECT'
                )}
              </Text>
            </Pressable>
          </View>

          {/* Divider + status rows */}
          <View style={s.dividerTop} pointerEvents="none">
            <View style={s.row}>
              <Text style={[s.rowLabel, {color: t.muted}]}>Reader</Text>
              <Text style={[s.rowValue, {color: t.text}]}>{statusLabel}</Text>
            </View>

            {/* ✅ Big indicator */}
            {bigStatus ? (
              <Text
                style={[
                  s.statusText,
                  {
                    marginTop: 10,
                    fontSize: 18,
                    fontWeight: '900',
                    color: t.text, // ✅ theme-based
                  },
                ]}>
                {bigStatus}
              </Text>
            ) : null}
          </View>

          {/* Amount box */}
          <Pressable
            onPress={() => onGoToTip?.()}
            hitSlop={16}
            style={[
              s.bigAmountBox,
              {
                backgroundColor: t.inputBg, // ✅ theme-based
                borderColor: t.border, // ✅ theme-based
              },
            ]}>
            <Text style={[s.bigAmount, {color: t.text}]}>{totalLabel}</Text>
            <Text style={[s.bigAmountSub, {color: t.muted}]}>
              Tap amount to enter (then Tip → Payment Method → Receipt)
            </Text>
          </Pressable>

          <Text
            style={[s.statusText, {marginTop: 10, color: t.muted}]}
            pointerEvents="none">
            Flow: Amount → Tip → Choose Cash/Card → Receipt
          </Text>
        </View>
      </View>
    </View>
  );
}
