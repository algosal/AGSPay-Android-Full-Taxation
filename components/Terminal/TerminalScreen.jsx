// FILE: components/Terminal/TerminalScreen.jsx

import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, Alert, Pressable, TextInput} from 'react-native';
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

/**
 * App/Receipt clears by storing a single space " ".
 * So we trim() here and treat it as empty.
 */
async function readAgpayComment() {
  try {
    const creds = await Keychain.getInternetCredentials('agpayComment');
    const raw = creds?.password ? String(creds.password) : '';
    return raw.trim();
  } catch (e) {
    console.log('readAgpayComment error:', e);
    return '';
  }
}

/**
 * Android Keychain cannot store empty values.
 */
async function writeAgpayComment(text) {
  try {
    const normalized = String(text || '').trim();
    const safePassword = normalized.length ? normalized : ' ';
    await Keychain.setInternetCredentials(
      'agpayComment',
      'comment',
      safePassword,
    );
    return true;
  } catch (e) {
    console.log('writeAgpayComment error:', e);
    return false;
  }
}

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function TerminalScreen({
  onGoToTip,
  onGoToSales,
  onConnectReader,
  onDisconnectReader,
  readerStatus,
  isReaderBusy,
  chargeData,
  commentResetNonce,
  terminalStatusLine,
  theme,
}) {
  const s = terminalStyles;
  const [sel, setSel] = useState(null);
  const [comment, setComment] = useState('');

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
    let mounted = true;

    (async () => {
      const selection = await readAgpaySelection();
      if (mounted) setSel(selection || null);

      const saved = await readAgpayComment();
      if (mounted) setComment(saved || '');
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const connected = !!readerStatus?.connected;

  const subtitle = useMemo(() => {
    const st = sel?.storeName ? String(sel.storeName) : 'Store';
    return st;
  }, [sel]);

  const readerDisplayLabel = connected ? 'Alba M2 Connected' : 'No reader';

  const readerRevealText = useMemo(() => {
    const serial =
      readerStatus?.serialNumber ||
      readerStatus?.label ||
      readerStatus?.id ||
      'Unknown';
    return String(serial);
  }, [readerStatus]);

  const totalCents = Number(chargeData?.totalCents || 0);
  const totalLabel =
    chargeData?.totalLabel || (totalCents ? centsToMoney(totalCents) : '$0.00');

  const bigStatus = terminalStatusLine || (isReaderBusy ? 'Working…' : '');

  /**
   * GREEN SCREEN LOGIC
   * If Stripe says "Present card", make terminal screen green
   */
  const isPresentCard = useMemo(() => {
    const v = String(terminalStatusLine || bigStatus || '').toLowerCase();
    return v.includes('present card');
  }, [terminalStatusLine, bigStatus]);

  const screenBg = isPresentCard ? '#16a34a' : t.bg;
  const cardBg = isPresentCard ? '#0b3d1e' : t.card;
  const inputBg = isPresentCard ? '#0f4d26' : t.inputBg;

  return (
    <View style={[s.screen, {backgroundColor: screenBg}]} pointerEvents="auto">
      <View style={s.content} pointerEvents="auto">
        <View
          style={[s.card, {backgroundColor: cardBg, borderColor: t.border}]}
          pointerEvents="auto">
          <View style={s.headerRow} pointerEvents="auto">
            <View style={{width: 60}} />

            <View style={{flex: 1, alignItems: 'center'}} pointerEvents="none">
              <View style={s.titleRow}>
                <Text style={[s.titleAG, {color: t.text}]}>AG</Text>
                <Text style={[s.titlePay, {color: t.gold}]}>Pay</Text>
              </View>

              <Text style={[s.subtitle, {color: t.muted}]} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>

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
                {backgroundColor: inputBg, borderColor: t.border},
              ]}>
              <Text style={[s.connectChipText, {color: t.text}]}>
                {connected ? (
                  <Text style={[s.connectChipTextGold, {color: t.gold}]}>
                    CONNECTED
                  </Text>
                ) : (
                  'CONNECT'
                )}
              </Text>
            </Pressable>
          </View>

          <View style={s.dividerTop} pointerEvents="auto">
            <View style={s.row} pointerEvents="auto">
              <Text style={[s.rowLabel, {color: t.muted}]}>Reader</Text>

              <Pressable
                onPress={() => {
                  if (!connected) return;
                  Alert.alert('Stripe Reader', readerRevealText);
                }}
                hitSlop={10}>
                <Text style={[s.rowValue, {color: t.text}]}>
                  {readerDisplayLabel}
                </Text>
              </Pressable>
            </View>

            {bigStatus ? (
              <Text
                style={[
                  s.statusText,
                  {
                    marginTop: 10,
                    fontSize: 18,
                    fontWeight: '900',
                    color: t.text,
                  },
                ]}>
                {bigStatus}
              </Text>
            ) : null}
          </View>

          <Pressable
            onPress={async () => {
              await writeAgpayComment(comment);
              onGoToTip?.();
            }}
            hitSlop={16}
            style={[
              s.bigAmountBox,
              {backgroundColor: inputBg, borderColor: t.border},
            ]}>
            <Text style={[s.bigAmount, {color: t.text}]}>{totalLabel}</Text>
            <Text style={[s.bigAmountSub, {color: t.muted}]}>
              Tap amount to enter (then Tip → Payment Method → Receipt)
            </Text>
          </Pressable>

          <View
            style={{
              marginTop: 12,
              backgroundColor: inputBg,
              borderColor: t.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}>
            <Text style={{color: t.muted, marginBottom: 6, fontSize: 12}}>
              Comment / Description (sent to Stripe)
            </Text>
            <TextInput
              value={comment}
              onChangeText={txt => setComment(txt)}
              placeholder="e.g., table 4, vendor note, special request…"
              placeholderTextColor={t.muted}
              style={{color: t.text, fontSize: 14, padding: 0, margin: 0}}
              autoCapitalize="sentences"
              autoCorrect
              returnKeyType="done"
            />
          </View>

          <Pressable
            onPress={() => onGoToSales?.()}
            hitSlop={16}
            style={[
              s.bigAmountBox,
              {
                marginTop: 12,
                backgroundColor: inputBg,
                borderColor: t.border,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 18,
              },
            ]}>
            <Text style={{fontSize: 32}}>💰</Text>
            <Text style={{color: t.gold, marginTop: 6, fontWeight: '800'}}>
              Today’s Sales
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
