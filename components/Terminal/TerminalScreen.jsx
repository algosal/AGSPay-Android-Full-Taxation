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

function normalizeBatteryPercent(readerStatus) {
  const raw = readerStatus?.batteryLevel;

  if (typeof raw !== 'number' || Number.isNaN(raw)) return null;

  if (raw >= 0 && raw <= 1) {
    return Math.round(raw * 100);
  }

  if (raw >= 0 && raw <= 100) {
    return Math.round(raw);
  }

  return null;
}

function getBatteryColor(percent) {
  if (typeof percent !== 'number') return '#9ca3af';

  if (percent <= 30) return '#ef4444';
  if (percent <= 50) return '#facc15';
  return '#22c55e';
}

function BatteryBar({percent, borderColor}) {
  const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
  const fillColor = getBatteryColor(safePercent);

  return (
    <View style={{flexDirection: 'row', alignItems: 'center'}}>
      <View
        style={{
          width: 34,
          height: 16,
          borderWidth: 1.5,
          borderColor,
          borderRadius: 4,
          padding: 2,
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: `${safePercent}%`,
            height: 8,
            backgroundColor: fillColor,
            borderRadius: 2,
          }}
        />
      </View>

      <View
        style={{
          width: 3,
          height: 8,
          marginLeft: 2,
          borderRadius: 1,
          backgroundColor: borderColor,
        }}
      />
    </View>
  );
}

export default function TerminalScreen({
  onGoToTip,
  onGoToSales,
  onGoToTransactions,
  onConnectReader,
  onDisconnectReader,
  onRefreshReaderStatus,
  onSetPaymentDeviceMode,
  paymentDeviceMode = 'reader',
  readerStatus,
  isReaderBusy,
  chargeData,
  terminalStatusLine,
  theme,
}) {
  const s = terminalStyles;
  const [sel, setSel] = useState(null);
  const [comment, setComment] = useState('');
  const [batteryTapCount, setBatteryTapCount] = useState(0);

  const didPresentRef = useRef(false);
  const didSuccessRef = useRef(false);
  const didFailRef = useRef(false);
  const batteryTapTimerRef = useRef(null);

  const t = useMemo(() => {
    return {
      bg: theme?.bg ?? '#020617',
      card: theme?.card ?? '#050814',
      inputBg: theme?.inputBg ?? '#0b1222',
      text: theme?.text ?? '#ffffff',
      muted: theme?.muted ?? '#9ca3af',
      border: theme?.border ?? '#1f2937',
      gold: theme?.gold ?? '#d4af37',
    };
  }, [theme]);

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

  useEffect(() => {
    return () => {
      if (batteryTapTimerRef.current) {
        clearTimeout(batteryTapTimerRef.current);
        batteryTapTimerRef.current = null;
      }
    };
  }, []);

  const connected = !!readerStatus?.connected;

  const subtitle = useMemo(() => {
    const st = sel?.storeName ? String(sel.storeName) : 'Store';
    return st;
  }, [sel]);

  const readerDisplayLabel = useMemo(() => {
    if (!connected) return 'No reader';
    return paymentDeviceMode === 'nfc'
      ? 'Phone NFC Connected'
      : 'Alba M2 Connected';
  }, [connected, paymentDeviceMode]);

  const readerRevealText = useMemo(() => {
    const serial =
      readerStatus?.serialNumber ||
      readerStatus?.label ||
      readerStatus?.id ||
      (paymentDeviceMode === 'nfc' ? 'Tap to Pay on this device' : 'Unknown');
    return String(serial);
  }, [readerStatus, paymentDeviceMode]);

  const batteryPercent = useMemo(() => {
    if (!connected) return null;
    if (paymentDeviceMode !== 'reader') return null;
    return normalizeBatteryPercent(readerStatus);
  }, [connected, paymentDeviceMode, readerStatus]);

  const batteryColor = useMemo(() => {
    return getBatteryColor(batteryPercent);
  }, [batteryPercent]);

  const isCharging = useMemo(() => {
    return (
      connected &&
      paymentDeviceMode === 'reader' &&
      batteryPercent !== null &&
      readerStatus?.isCharging === true
    );
  }, [connected, paymentDeviceMode, batteryPercent, readerStatus]);

  const totalCents = Number(chargeData?.totalCents || 0);
  const totalLabel =
    chargeData?.totalLabel || (totalCents ? centsToMoney(totalCents) : '$0.00');

  const bigStatus = terminalStatusLine || (isReaderBusy ? 'Working…' : '');

  const statusLower = useMemo(() => {
    return String(terminalStatusLine || bigStatus || '').toLowerCase();
  }, [terminalStatusLine, bigStatus]);

  const isPresentCard = useMemo(() => {
    return (
      statusLower.includes('present card') ||
      statusLower.includes('tap card now')
    );
  }, [statusLower]);

  const isPaymentSuccess = useMemo(() => {
    return (
      statusLower.includes('payment succeeded') ||
      statusLower.includes('saving transaction')
    );
  }, [statusLower]);

  const isPaymentFailed = useMemo(() => {
    return statusLower.includes('payment failed');
  }, [statusLower]);

  const screenBg = isPresentCard ? '#16a34a' : t.bg;
  const cardBg = isPresentCard ? '#0b3d1e' : t.card;
  const inputBg = isPresentCard ? '#0f4d26' : t.inputBg;

  const PRESENT_SOUND = 'beep.wav';
  const SUCCESS_SOUND = 'success.wav';
  const FAIL_SOUND = 'fail.wav';

  useEffect(() => {
    if (
      statusLower.includes('creating paymentintent') ||
      statusLower.includes('retrieving intent') ||
      statusLower.includes('present card') ||
      statusLower.includes('tap card now')
    ) {
      didSuccessRef.current = false;
      didFailRef.current = false;
    }
  }, [statusLower]);

  useEffect(() => {
    if (isPresentCard) {
      if (didPresentRef.current) return;
      didPresentRef.current = true;
      playRawSound(PRESENT_SOUND, {vibrateMs: 80});
    } else {
      didPresentRef.current = false;
    }
  }, [isPresentCard, playRawSound]);

  useEffect(() => {
    if (isPaymentSuccess) {
      if (didSuccessRef.current) return;
      didSuccessRef.current = true;
      playRawSound(SUCCESS_SOUND, {vibrateMs: 60});
    } else {
      didSuccessRef.current = false;
    }
  }, [isPaymentSuccess, playRawSound]);

  useEffect(() => {
    if (isPaymentFailed) {
      if (didFailRef.current) return;
      didFailRef.current = true;

      try {
        Vibration.vibrate([0, 250, 120, 250]);
      } catch {}

      playRawSound(FAIL_SOUND);
    } else {
      didFailRef.current = false;
    }
  }, [isPaymentFailed, playRawSound]);

  const handleBatteryPress = async () => {
    if (isReaderBusy) return;

    const nextCount = batteryTapCount + 1;
    setBatteryTapCount(nextCount);

    if (batteryTapTimerRef.current) {
      clearTimeout(batteryTapTimerRef.current);
    }

    if (nextCount >= 3) {
      setBatteryTapCount(0);
      batteryTapTimerRef.current = null;

      try {
        await onRefreshReaderStatus?.();
      } catch (e) {
        Alert.alert('Refresh failed', String(e?.message || e));
      }
      return;
    }

    batteryTapTimerRef.current = setTimeout(() => {
      setBatteryTapCount(0);
      batteryTapTimerRef.current = null;
    }, 2500);
  };

  return (
    <View style={[s.screen, {backgroundColor: screenBg}]}>
      <View style={s.content}>
        <View
          style={[s.card, {backgroundColor: cardBg, borderColor: t.border}]}>
          <View style={s.headerRow}>
            <View style={{width: 60}} />

            <View style={{flex: 1, alignItems: 'center'}}>
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

          <View
            style={{
              marginTop: 12,
              flexDirection: 'row',
              gap: 10,
            }}>
            <Pressable
              onPress={() => onSetPaymentDeviceMode?.('reader')}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: paymentDeviceMode === 'reader' ? t.gold : t.border,
                backgroundColor:
                  paymentDeviceMode === 'reader' ? inputBg : t.inputBg,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}>
              <Text
                style={{
                  color: paymentDeviceMode === 'reader' ? t.gold : t.text,
                  fontWeight: '900',
                }}>
                Reader
              </Text>
            </Pressable>

            <Pressable
              onPress={() => onSetPaymentDeviceMode?.('nfc')}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: paymentDeviceMode === 'nfc' ? t.gold : t.border,
                backgroundColor:
                  paymentDeviceMode === 'nfc' ? inputBg : t.inputBg,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}>
              <Text
                style={{
                  color: paymentDeviceMode === 'nfc' ? t.gold : t.text,
                  fontWeight: '900',
                }}>
                Phone NFC
              </Text>
            </Pressable>
          </View>

          <View style={s.dividerTop}>
            <View
              style={[
                s.row,
                {
                  alignItems: 'center',
                  justifyContent: 'space-between',
                },
              ]}>
              <Text style={[s.rowLabel, {color: t.muted}]}>
                {paymentDeviceMode === 'nfc' ? 'NFC' : 'Reader'}
              </Text>

              {connected &&
              paymentDeviceMode === 'reader' &&
              batteryPercent !== null ? (
                <Pressable
                  onPress={handleBatteryPress}
                  hitSlop={10}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                  <BatteryBar percent={batteryPercent} borderColor={t.border} />

                  <Text style={[s.rowValue, {color: batteryColor}]}>
                    {batteryPercent}%
                  </Text>

                  {isCharging ? (
                    <Text
                      style={{
                        color: t.gold,
                        fontWeight: '800',
                        fontSize: 12,
                      }}>
                      Charging
                    </Text>
                  ) : null}
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => {
                  if (!connected) return;
                  Alert.alert(
                    paymentDeviceMode === 'nfc'
                      ? 'Phone NFC Details'
                      : 'Stripe Reader',
                    readerRevealText,
                  );
                }}>
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
              style={{color: t.text, fontSize: 14}}
            />
          </View>

          <Pressable
            onPress={() => onGoToSales?.()}
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

          <Pressable
            onPress={() => onGoToTransactions?.()}
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
            <Text style={{fontSize: 32}}>🧾</Text>
            <Text style={{color: t.gold, marginTop: 6, fontWeight: '800'}}>
              Transactions
            </Text>
          </Pressable>

          <Text style={[s.statusText, {marginTop: 10, color: t.muted}]}>
            Flow: Amount → Tip → Choose Cash/Card → Receipt
          </Text>
        </View>
      </View>
    </View>
  );
}
