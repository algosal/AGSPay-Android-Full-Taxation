// FILE: components/Terminal/TerminalScreen.jsx

import React, {useEffect, useMemo, useRef, useState} from 'react';
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

async function readAgpayComment() {
  try {
    const creds = await Keychain.getInternetCredentials('agpayComment');
    if (!creds?.password) return '';
    return String(creds.password || '');
  } catch (e) {
    console.log('readAgpayComment error:', e);
    return '';
  }
}

async function writeAgpayComment(text) {
  try {
    await Keychain.setInternetCredentials(
      'agpayComment',
      'comment',
      String(text || ''),
    );
    return true;
  } catch (e) {
    console.log('writeAgpayComment error:', e);
    return false;
  }
}

async function clearAgpayComment() {
  try {
    // safest: set to empty (avoids reset errors on some Android builds)
    await Keychain.setInternetCredentials('agpayComment', 'comment', '');
    return true;
  } catch (e) {
    console.log('clearAgpayComment error:', e);
    return false;
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

  // ✅ App.js must pass this and bump it after CASH success too
  commentResetNonce,

  // ✅ OPTIONAL: if you wire this from App.js
  terminalStatusLine,

  // ✅ theme comes from App.js
  theme,
}) {
  const s = terminalStyles;
  const [sel, setSel] = useState(null);
  const [comment, setComment] = useState('');

  // Track last-seen "success id" so we clear only once per completed transaction
  const lastClearedSuccessIdRef = useRef(null);

  // ✅ Prevent stale Keychain read from re-populating after a reset
  const ignoreHydrationRef = useRef(false);

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

      // ✅ If a reset was requested, DO NOT hydrate the old comment back in
      if (!mounted) return;
      if (ignoreHydrationRef.current) return;

      setComment(saved || '');
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ✅ HARD RESET: when App increments nonce, clear immediately
  // This is what fixes CASH flow where Payment.js is never hit.
  useEffect(() => {
    if (commentResetNonce === undefined || commentResetNonce === null) return;

    (async () => {
      try {
        // ✅ block any in-flight hydration from overwriting the clear
        ignoreHydrationRef.current = true;

        setComment('');
        await clearAgpayComment();

        // also clear the "auto-clear guard" so next success can clear again if needed
        lastClearedSuccessIdRef.current = null;

        // allow future loads (but this instance is already mounted)
        // keep it true for the rest of this mount; safest to avoid re-hydration surprises
      } catch (e) {
        console.log('commentResetNonce clear error:', e);
      }
    })();
  }, [commentResetNonce]);

  // ✅ Auto-clear comment after a successful transaction is detected (CARD flow / any flow that marks success)
  useEffect(() => {
    const status = String(chargeData?.status || '').toLowerCase();
    const isSuccess =
      status === 'succeeded' ||
      status === 'success' ||
      status === 'paid' ||
      status === 'completed' ||
      chargeData?.success === true;

    const successId =
      chargeData?.receiptId ||
      chargeData?.transactionId ||
      chargeData?.paymentIntentId ||
      chargeData?.chargeId ||
      chargeData?.clientEpochMs ||
      chargeData?.createdAt ||
      chargeData?.paidAt ||
      null;

    if (!isSuccess || !successId) return;

    if (lastClearedSuccessIdRef.current === successId) return;
    lastClearedSuccessIdRef.current = successId;

    (async () => {
      // also block hydration surprises after a success-clear
      ignoreHydrationRef.current = true;

      await clearAgpayComment();
      setComment('');
    })();
  }, [chargeData]);

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

  const bigStatus = terminalStatusLine || (isReaderBusy ? 'Working…' : '');

  return (
    <View style={[s.screen, {backgroundColor: t.bg}]} pointerEvents="auto">
      <View style={s.content} pointerEvents="auto">
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
            <Pressable
              onPress={() => onBackToStoreSelect?.()}
              hitSlop={12}
              style={[
                s.connectChip,
                {
                  backgroundColor: t.inputBg,
                  borderColor: t.border,
                },
              ]}>
              <Text style={[s.connectChipText, {color: t.text}]}>Back</Text>
            </Pressable>

            <View style={{flex: 1, alignItems: 'center'}} pointerEvents="none">
              <View style={s.titleRow}>
                <Text style={[s.titleAG, {color: t.text}]}>AG</Text>
                <Text style={[s.titlePay, {color: t.gold}]}>Pay</Text>
              </View>
              <Text style={[s.subtitle, {color: t.muted}]}>{subtitle}</Text>
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
                {
                  backgroundColor: t.inputBg,
                  borderColor: t.border,
                },
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

          <View style={s.dividerTop} pointerEvents="none">
            <View style={s.row}>
              <Text style={[s.rowLabel, {color: t.muted}]}>Reader</Text>
              <Text style={[s.rowValue, {color: t.text}]}>{statusLabel}</Text>
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
              {
                backgroundColor: t.inputBg,
                borderColor: t.border,
              },
            ]}>
            <Text style={[s.bigAmount, {color: t.text}]}>{totalLabel}</Text>
            <Text style={[s.bigAmountSub, {color: t.muted}]}>
              Tap amount to enter (then Tip → Payment Method → Receipt)
            </Text>
          </Pressable>

          <View
            style={{
              marginTop: 12,
              backgroundColor: t.inputBg,
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
              style={{
                color: t.text,
                fontSize: 14,
                padding: 0,
                margin: 0,
              }}
              autoCapitalize="sentences"
              autoCorrect
              returnKeyType="done"
            />
          </View>

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
