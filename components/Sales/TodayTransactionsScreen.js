// FILE: components/Sales/TodayTransactionsScreen.js

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import * as Keychain from 'react-native-keychain';

const TXN_URL =
  'https://kvscjsddkd.execute-api.us-east-2.amazonaws.com/prod/VendioTransactions';

const EMAIL_RECEIPT_URL = 'https://agspay.us/email/receipt.php';
const AGPAY_EMAIL_KEY = 'TEST_SECRET_123';

/* ---------------- AUTH HELPERS ---------------- */

async function readAgpayAuthToken() {
  try {
    const tokenCreds = await Keychain.getGenericPassword({
      service: 'agpayAuthToken',
    });

    if (tokenCreds?.password && typeof tokenCreds.password === 'string') {
      return tokenCreds.password;
    }

    const creds = await Keychain.getInternetCredentials('agpayAuth');
    if (!creds?.password) return null;

    const parsed = JSON.parse(creds.password);
    return parsed?.token || null;
  } catch (e) {
    console.log('readAgpayAuthToken error:', e);
    return null;
  }
}

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

/* ---------------- UTILITIES ---------------- */

function safeJsonParse(x) {
  try {
    return JSON.parse(String(x || '').trim());
  } catch {
    return null;
  }
}

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getEpochMs(t) {
  const n = Number(t?.serverEpochMs ?? t?.clientEpochMs ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function centsToUsd(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${(n / 100).toFixed(2)}`;
}

function isPayoutEventRow(t) {
  return String(t?.debugMeta?.rowType || '').trim() === 'PAYOUT_EVENT';
}

function getTxnAmountCents(t) {
  return Number(t?.totalCents ?? t?.stripe?.amount ?? 0) || 0;
}

function getSubtotalCents(t) {
  return Number(t?.subtotalCents ?? t?.debugMeta?.subtotalCents ?? 0) || 0;
}

function getTaxCents(t) {
  return Number(t?.taxCents ?? t?.debugMeta?.taxCents ?? 0) || 0;
}

function getTipCents(t) {
  return Number(t?.tipCents ?? t?.debugMeta?.tipCents ?? 0) || 0;
}

function getServiceFeeCents(t) {
  return (
    Number(
      t?.albaFeeCents ??
        t?.serviceFeeCents ??
        t?.debugMeta?.albaFeeCents ??
        t?.debugMeta?.serviceFeeCents ??
        0,
    ) || 0
  );
}

function getPayoutCents(t) {
  return Number(t?.payoutAmountCents ?? 0) || 0;
}

function getCardCountry(t) {
  return String(
    t?.cardCountry ||
      t?.debugMeta?.cardCountry ||
      t?.stripe?.payment_method_details?.card_present?.country ||
      t?.stripe?.charges?.data?.[0]?.payment_method_details?.card_present
        ?.country ||
      '',
  ).trim();
}

function getCardLast4(t) {
  return String(
    t?.cardLast4 ||
      t?.debugMeta?.cardLast4 ||
      t?.stripe?.payment_method_details?.card_present?.last4 ||
      t?.stripe?.charges?.data?.[0]?.payment_method_details?.card_present
        ?.last4 ||
      '',
  ).trim();
}

function isToday(epochMs) {
  if (!epochMs) return false;

  const d = new Date(epochMs);
  const now = new Date();

  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatTime(epochMs) {
  if (!epochMs) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(epochMs));
}

function formatCreatedAtText(epochMs) {
  if (!epochMs) return '';
  return new Date(epochMs).toLocaleString();
}

function extractStoreName(selection) {
  return String(
    selection?.storeName ||
      selection?.selectedStore?.storeName ||
      selection?.store?.storeName ||
      'Store',
  ).trim();
}

function extractStorePrefix(selection) {
  const candidates = [
    selection?.corpStoreKey,
    selection?.storePrefix,
    selection?.storeKey,
    selection?.selectedStore?.corpStoreKey,
    selection?.store?.corpStoreKey,
  ];

  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s.startsWith('CORP#') && s.includes('#STORE#')) {
      return s;
    }
  }

  return '';
}

function isValidEmail(email) {
  const e = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function buildReceiptHtmlFromTxn(txn, storeNameOverride = '') {
  const totalCents = getTxnAmountCents(txn);
  const subtotalCents = getSubtotalCents(txn);
  const taxCents = getTaxCents(txn);
  const tipCents = getTipCents(txn);
  const albaFeeCents = getServiceFeeCents(txn);
  const createdAtText = formatCreatedAtText(getEpochMs(txn));
  const storeName =
    storeNameOverride || txn?.storeName || txn?.corporateName || 'AGPay';

  const last4 = getCardLast4(txn);
  const country = getCardCountry(txn);

  const cardLine = last4
    ? `Card • CARD • •••• ${last4}${country ? ` • ${country}` : ''}`
    : country
    ? `Card • CARD • ${country}`
    : '';

  return `
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: #fff; }
      body {
        font-family: monospace;
        font-size: 18px;
        line-height: 1.15;
        color: #000;
        box-sizing: border-box;
      }
      .wrap { padding: 14px 16px; max-width: 420px; margin: 0 auto; }
      .brand { text-align: center; margin-top: 6px; }
      .brand .logo { font-weight: 900; letter-spacing: 2px; font-size: 22px; }
      .brand .sub { margin-top: 2px; font-size: 13px; letter-spacing: 1.2px; text-transform: uppercase; }
      .copyTag {
        margin-top: 6px;
        text-align: center;
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      .divider { border-top: 1px solid #000; margin: 12px 0; }
      .meta { font-size: 14px; margin: 2px 0; }
      .meta .k { opacity: 0.75; }
      .meta .v { font-weight: 900; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      td { padding: 3px 0; vertical-align: top; overflow: hidden; }
      td.l { width: 60%; white-space: nowrap; text-overflow: ellipsis; }
      td.r { width: 40%; text-align: right; white-space: nowrap; font-weight: 900; }
      .totalWrap {
        border-top: 1px solid #000;
        border-bottom: 1px solid #000;
        padding: 10px 0;
        margin-top: 10px;
      }
      .totalRow { display: flex; justify-content: space-between; align-items: baseline; }
      .totalLabel { font-size: 16px; font-weight: 900; letter-spacing: 1px; }
      .totalValue { font-size: 22px; font-weight: 900; }
      .footer { text-align: center; margin-top: 12px; padding-bottom: 10px; }
      .thanks { font-weight: 900; letter-spacing: 1px; text-transform: uppercase; font-size: 14px; }
      .fine { font-size: 11px; opacity: 0.9; margin-top: 4px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="brand">
        <div class="logo">AGPAY</div>
        <div class="sub">RECEIPT</div>
      </div>

      <div class="copyTag">CLIENT COPY</div>

      <div class="divider"></div>

      <div class="meta"><span class="k">Transaction Date</span>: <span class="v">${escapeHtml(
        createdAtText,
      )}</span></div>
      <div class="meta"><span class="k">Location</span>: <span class="v">${escapeHtml(
        storeName,
      )}</span></div>

      <div class="divider"></div>

      <div class="meta"><span class="k">Payment Method</span>: <span class="v">CARD</span></div>
      ${
        cardLine
          ? `<div class="meta"><span class="v">${escapeHtml(
              cardLine,
            )}</span></div>`
          : ''
      }

      <div class="divider"></div>

      <table>
        <tr><td class="l">Subtotal</td><td class="r">${escapeHtml(
          centsToUsd(subtotalCents),
        )}</td></tr>
        <tr><td class="l">Sales Tax</td><td class="r">${escapeHtml(
          centsToUsd(taxCents),
        )}</td></tr>
        <tr><td class="l">Service Fee</td><td class="r">${escapeHtml(
          centsToUsd(albaFeeCents),
        )}</td></tr>
        <tr><td class="l">Tip</td><td class="r">${escapeHtml(
          centsToUsd(tipCents),
        )}</td></tr>
      </table>

      <div class="totalWrap">
        <div class="totalRow">
          <div class="totalLabel">TOTAL</div>
          <div class="totalValue">${escapeHtml(centsToUsd(totalCents))}</div>
        </div>
      </div>

      <div class="footer">
        <div class="thanks">Thank you for choosing AGPay</div>
        <div class="fine">Luxury-grade payments • Secure • Trusted</div>
      </div>
    </div>
  </body>
  </html>`;
}

/* ---------------- SCREEN ---------------- */

export default function TodayTransactionsScreen({onBack, theme}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');
  const [storeName, setStoreName] = useState('Store');

  const [selectedTxn, setSelectedTxn] = useState(null);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState('');
  const [busyEmail, setBusyEmail] = useState(false);

  const t = useMemo(() => {
    return {
      bg: theme?.bg ?? '#020617',
      card: theme?.card ?? '#050814',
      inputBg: theme?.inputBg ?? '#0b1222',
      text: theme?.text ?? '#ffffff',
      muted: theme?.muted ?? '#9ca3af',
      border: theme?.border ?? '#1f2937',
      gold: theme?.gold ?? '#d4af37',
      danger: theme?.danger ?? '#ef4444',
    };
  }, [theme]);

  const loadTransactions = useCallback(async (pull = false) => {
    try {
      if (pull) setRefreshing(true);
      else setLoading(true);

      setErr('');

      const token = await readAgpayAuthToken();
      const selection = await readAgpaySelection();

      const storePrefix = extractStorePrefix(selection);
      const currentStoreName = extractStoreName(selection);

      setStoreName(currentStoreName);

      const resp = await fetch(
        `${TXN_URL}?storePrefix=${encodeURIComponent(storePrefix)}`,
        {
          headers: {Authorization: token},
        },
      );

      const text = await resp.text();
      let outer = safeJsonParse(text);
      let data = outer?.body ? safeJsonParse(outer.body) : outer;

      const arr = Array.isArray(data) ? data : [];

      const filtered = arr
        .filter(txn => !isPayoutEventRow(txn))
        .filter(txn => isToday(getEpochMs(txn)))
        .sort((a, b) => getEpochMs(b) - getEpochMs(a));

      setRows(filtered);
    } catch (e) {
      setErr(String(e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTransactions(false);
  }, [loadTransactions]);

  const totalTodayCents = useMemo(() => {
    return rows.reduce((sum, txn) => sum + getTxnAmountCents(txn), 0);
  }, [rows]);

  const openEmailModal = txn => {
    setSelectedTxn(txn);
    setReceiptEmail('');
    setEmailModalVisible(true);
  };

  const handleEmailReceipt = async () => {
    try {
      if (busyEmail) return;

      if (!selectedTxn) {
        Alert.alert('Receipt', 'No transaction selected.');
        return;
      }

      const to = String(receiptEmail || '').trim();
      if (!isValidEmail(to)) {
        Alert.alert('Invalid email', 'Please enter a valid email address.');
        return;
      }

      setBusyEmail(true);

      const subtotalCents = getSubtotalCents(selectedTxn);
      const taxCents = getTaxCents(selectedTxn);
      const tipCents = getTipCents(selectedTxn);
      const albaFeeCents = getServiceFeeCents(selectedTxn);
      const totalCents = getTxnAmountCents(selectedTxn);

      const htmlClient = buildReceiptHtmlFromTxn(selectedTxn, storeName);

      const payload = {
        to,
        storeName:
          storeName ||
          selectedTxn?.storeName ||
          selectedTxn?.corporateName ||
          'AGPay',
        createdAtText: formatCreatedAtText(getEpochMs(selectedTxn)),
        paymentMethod: 'CARD',
        receiptId:
          selectedTxn?.txnKey ||
          selectedTxn?.stripe?.paymentIntentId ||
          selectedTxn?.stripe?.chargeId ||
          '',

        subtotalText: centsToUsd(subtotalCents),
        taxText: centsToUsd(taxCents),
        tipText: centsToUsd(tipCents),
        totalText: centsToUsd(totalCents),

        items: [
          {
            name: 'Subtotal',
            qty: 1,
            priceText: centsToUsd(subtotalCents),
          },
          {
            name: 'Sales Tax',
            qty: 1,
            priceText: centsToUsd(taxCents),
          },
          {
            name: 'Service Fee',
            qty: 1,
            priceText: centsToUsd(albaFeeCents),
          },
          {
            name: 'Tip',
            qty: 1,
            priceText: centsToUsd(tipCents),
          },
        ].filter(x => x.priceText !== '$0.00'),

        notes:
          'Thank you for choosing AGPay. Your confirmation has been recorded securely. If anything looks unfamiliar, reply to this email and our team will assist promptly.',

        htmlClient,
      };

      const resp = await fetch(EMAIL_RECEIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AGPAY-KEY': AGPAY_EMAIL_KEY,
        },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${text}`);
      }

      const json = safeJsonParse(text);
      if (json && json.ok === true) {
        Alert.alert('Sent', `Receipt emailed to:\n${to}`);
      } else {
        Alert.alert('Sent', `Receipt request completed.\n\nServer:\n${text}`);
      }

      setEmailModalVisible(false);
      setReceiptEmail('');
    } catch (e) {
      console.log('TodayTransactionsScreen handleEmailReceipt error:', e);
      Alert.alert('Email failed', String(e?.message || e));
    } finally {
      setBusyEmail(false);
    }
  };

  const renderRow = ({item}) => {
    const epoch = getEpochMs(item);
    const totalAmount = getTxnAmountCents(item);
    const subtotal = getSubtotalCents(item);
    const country = getCardCountry(item);
    const last4 = getCardLast4(item);

    return (
      <View
        style={{
          backgroundColor: t.inputBg,
          borderColor: t.border,
          borderWidth: 1,
          borderRadius: 14,
          padding: 14,
          marginBottom: 10,
        }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}>
          <View style={{flex: 1}}>
            <Text style={{color: t.text, fontSize: 18, fontWeight: '800'}}>
              {formatTime(epoch)}
            </Text>

            <Text style={{color: t.muted}}>
              Subtotal: {centsToUsd(subtotal)}
            </Text>
            <Text style={{color: t.muted}}>Country: {country || '-'}</Text>
            <Text style={{color: t.muted}}>Last 4: {last4 || '-'}</Text>
            <Text style={{color: t.muted}}>Payment Successful</Text>
          </View>

          <Pressable onPress={() => openEmailModal(item)}>
            <Text style={{color: t.gold, fontSize: 20, fontWeight: '900'}}>
              {centsToUsd(totalAmount)}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={{flex: 1, backgroundColor: t.bg, padding: 16}}>
      {/* HEADER */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}>
        <Pressable
          onPress={() => onBack?.()}
          style={{
            backgroundColor: t.inputBg,
            borderColor: t.border,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}>
          <Text style={{color: t.text, fontWeight: '800'}}>Back</Text>
        </Pressable>
      </View>

      {/* CARD */}
      <View
        style={{
          flex: 1,
          backgroundColor: t.card,
          borderColor: t.border,
          borderWidth: 1,
          borderRadius: 16,
          padding: 16,
        }}>
        <Text style={{color: t.text, fontSize: 24, fontWeight: '900'}}>
          Transactions
        </Text>

        <Text style={{color: t.muted}}>{storeName}</Text>

        <Text style={{color: t.gold, fontWeight: '800', marginVertical: 10}}>
          Total Today: {centsToUsd(totalTodayCents)}
        </Text>

        {loading ? (
          <ActivityIndicator color={t.gold} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item, index) =>
              String(item?.txnKey || `${getEpochMs(item)}-${index}`)
            }
            renderItem={renderRow}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadTransactions(true)}
                tintColor={t.gold}
              />
            }
          />
        )}
      </View>

      {/* FLOATING REFRESH BUTTON */}
      <Pressable
        onPress={() => loadTransactions(false)}
        style={{
          position: 'absolute',
          right: 20,
          bottom: 30,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: t.inputBg,
          borderColor: t.border,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{fontSize: 24, color: t.gold}}>🔄</Text>
      </Pressable>

      {/* EMAIL MODAL */}
      <Modal
        visible={emailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailModalVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            padding: 20,
          }}>
          <View
            style={{
              backgroundColor: t.card,
              borderColor: t.border,
              borderWidth: 1,
              borderRadius: 18,
              padding: 18,
            }}>
            <Text style={{color: t.text, fontSize: 20, fontWeight: '900'}}>
              Email Receipt
            </Text>

            <Text style={{color: t.muted, marginTop: 14}}>Total</Text>
            <Text style={{color: t.gold, fontSize: 20, fontWeight: '900'}}>
              {selectedTxn
                ? centsToUsd(getTxnAmountCents(selectedTxn))
                : '$0.00'}
            </Text>

            <View style={{marginTop: 16}}>
              <Text style={{color: t.muted}}>
                Subtotal:{' '}
                {selectedTxn
                  ? centsToUsd(getSubtotalCents(selectedTxn))
                  : '$0.00'}
              </Text>

              <Text style={{color: t.muted}}>
                Tax:{' '}
                {selectedTxn ? centsToUsd(getTaxCents(selectedTxn)) : '$0.00'}
              </Text>

              <Text style={{color: t.muted}}>
                Tip:{' '}
                {selectedTxn ? centsToUsd(getTipCents(selectedTxn)) : '$0.00'}
              </Text>

              <Text style={{color: t.muted}}>
                Service Fee:{' '}
                {selectedTxn
                  ? centsToUsd(getServiceFeeCents(selectedTxn))
                  : '$0.00'}
              </Text>

              <Text style={{color: t.muted}}>
                Payout:{' '}
                {selectedTxn
                  ? centsToUsd(getPayoutCents(selectedTxn))
                  : '$0.00'}
              </Text>
            </View>

            <View style={{marginTop: 14}}>
              <Text style={{color: t.muted}}>
                Country:{' '}
                {selectedTxn ? getCardCountry(selectedTxn) || '-' : '-'}
              </Text>

              <Text style={{color: t.muted}}>
                Last 4: {selectedTxn ? getCardLast4(selectedTxn) || '-' : '-'}
              </Text>

              <Text style={{color: t.muted}}>Status: Payment Successful</Text>
            </View>

            <TextInput
              value={receiptEmail}
              onChangeText={setReceiptEmail}
              placeholder="customer@email.com"
              placeholderTextColor={t.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              style={{
                marginTop: 16,
                color: t.text,
                backgroundColor: t.inputBg,
                borderColor: t.border,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
              }}
            />

            <View style={{flexDirection: 'row', marginTop: 16, gap: 10}}>
              <Pressable
                onPress={() => setEmailModalVisible(false)}
                style={{
                  flex: 1,
                  backgroundColor: t.inputBg,
                  borderColor: t.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 12,
                  alignItems: 'center',
                }}>
                <Text style={{color: t.text}}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleEmailReceipt}
                disabled={busyEmail}
                style={{
                  flex: 1,
                  backgroundColor: t.gold,
                  borderRadius: 12,
                  padding: 12,
                  alignItems: 'center',
                  opacity: busyEmail ? 0.6 : 1,
                }}>
                <Text style={{fontWeight: '900'}}>
                  {busyEmail ? 'Sending…' : 'Email Receipt'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
