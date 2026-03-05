// FILE: components/Terminal/TerminalScreen.jsx

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, Alert, Pressable, TextInput, Vibration} from 'react-native';
import * as Keychain from 'react-native-keychain';
import Sound from 'react-native-sound';
import terminalStyles from './terminal.styles';

Sound.setCategory('Playback');

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
 * ✅ IMPORTANT:
 * App/Receipt clears by storing a single space " ".
 * So we always trim() here and treat it as empty.
 */
async function readAgpayComment() {
  try {
    const creds = await Keychain.getInternetCredentials('agpayComment');
    const raw = creds?.password ? String(creds.password) : '';
    return raw.trim(); // " " => ""
  } catch (e) {
    console.log('readAgpayComment error:', e);
    return '';
  }
}

/**
 * ✅ IMPORTANT (Android):
 * setInternetCredentials throws if username OR password is empty.
 * So if user leaves comment empty, store " " instead.
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
  commentResetNonce, // not used
  terminalStatusLine,
  theme,
}) {
  const s = terminalStyles;
  const [sel, setSel] = useState(null);
  const [comment, setComment] = useState('');

  // ✅ ensure we only signal ONCE per status cycle
  const didPresentRef = useRef(false);
  const didSuccessRef = useRef(false);
  const didFailRef = useRef(false);

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

  // ✅ helper: play raw sound files safely (android/app/src/main/res/raw/)
  const playRawSound = useMemo(() => {
    return (fileName, {vibrateMs = 0} = {}) => {
      if (vibrateMs > 0) {
        try {
          Vibration.vibrate(vibrateMs);
        } catch {}
      }

      try {
        const snd = new Sound(fileName, Sound.MAIN_BUNDLE, error => {
          if (error) {
            console.log(`${fileName} load error:`, error);
            return;
          }
          snd.play(() => {
            snd.release();
          });
        });
      } catch (e) {
        console.log(`${fileName} play exception:`, e);
      }
    };
  }, []);

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

  // Normalize status text
  const statusLower = useMemo(() => {
    return String(terminalStatusLine || bigStatus || '').toLowerCase();
  }, [terminalStatusLine, bigStatus]);

  // Detect card prompt
  const isPresentCard = useMemo(
    () => statusLower.includes('present card'),
    [statusLower],
  );

  /**
   * ✅ SUCCESS detection (important fix):
   * PaymentTerminal sets "Payment succeeded" but then quickly overwrites
   * with "Saving transaction…", so we treat "Saving transaction" as success too.
   */
  const isPaymentSuccess = useMemo(() => {
    return (
      statusLower.includes('payment succeeded') ||
      statusLower.includes('saving transaction')
    );
  }, [statusLower]);

  /**
   * ✅ FAIL detection:
   * PaymentTerminal sets: setStatusLine(`Payment failed: ${...}`)
   */
  const isPaymentFailed = useMemo(() => {
    return statusLower.includes('payment failed');
  }, [statusLower]);

  // Green screen override
  const screenBg = isPresentCard ? '#16a34a' : t.bg;
  const cardBg = isPresentCard ? '#0b3d1e' : t.card;
  const inputBg = isPresentCard ? '#0f4d26' : t.inputBg;

  /**
   * ✅ Put these files in:
   * android/app/src/main/res/raw/
   *
   * - beep.wav    (present card)
   * - success.wav (payment success)
   * - fail.wav    (payment failed)
   */
  const PRESENT_SOUND = 'beep.wav';
  const SUCCESS_SOUND = 'success.wav';
  const FAIL_SOUND = 'fail.wav';

  // Reset latches when a new payment flow starts so sounds can play again
  useEffect(() => {
    if (
      statusLower.includes('creating paymentintent') ||
      statusLower.includes('creating paymentintent') ||
      statusLower.includes('retrieving intent') ||
      statusLower.includes('present card')
    ) {
      didSuccessRef.current = false;
      didFailRef.current = false;
    }
  }, [statusLower]);

  // Present card: beep + vibrate once
  useEffect(() => {
    if (isPresentCard) {
      if (didPresentRef.current) return;
      didPresentRef.current = true;
      playRawSound(PRESENT_SOUND, {vibrateMs: 80});
    } else {
      didPresentRef.current = false;
    }
  }, [isPresentCard, playRawSound]);

  // Payment success: success sound once (with light vibration)
  useEffect(() => {
    if (isPaymentSuccess) {
      if (didSuccessRef.current) return;
      didSuccessRef.current = true;
      playRawSound(SUCCESS_SOUND, {vibrateMs: 50});
    } else {
      didSuccessRef.current = false;
    }
  }, [isPaymentSuccess, playRawSound]);

  // Payment failed: fail sound once (with stronger vibration)
  useEffect(() => {
    if (isPaymentFailed) {
      if (didFailRef.current) return;
      didFailRef.current = true;
      playRawSound(FAIL_SOUND, {vibrateMs: 120});
    } else {
      didFailRef.current = false;
    }
  }, [isPaymentFailed, playRawSound]);

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
