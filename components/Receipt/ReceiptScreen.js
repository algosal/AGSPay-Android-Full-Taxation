// FILE: components/Receipt/ReceiptScreen.js
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Keychain from 'react-native-keychain';

const GOLD = '#d4af37';

// ✅ LIVE endpoint
const EMAIL_RECEIPT_URL = 'https://agspay.us/email/receipt.php';

// ✅ TEST key (move to safer config later)
const AGPAY_EMAIL_KEY = 'TEST_SECRET_123';

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

function money(cents) {
  const n = Number(cents ?? NaN);
  if (!Number.isFinite(n)) return '$0.00';
  return '$' + (n / 100).toFixed(2);
}

function clipText(value, max = 30) {
  const s = String(value || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function nOr0(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Safely resolve a cents field from:
 * - top-level receipt (preferred)
 * - receipt.breakdown (fallback)
 */
function resolveCents(receipt, key) {
  const r = receipt || {};
  const b = r.breakdown || {};
  return nOr0(r[key] ?? b[key]);
}

/**
 * ✅ build HTML (for emailing)
 */
function buildReceiptHtml(receipt, copyLabel = '') {
  const r = receipt || {};

  const totalCents =
    Number(r.totalCents) ||
    Number(r.grandTotalCents) ||
    Number(r.amountCents) ||
    0;

  const totalText =
    r.totalLabel || r.amountText || money(totalCents) || '(missing)';

  const subtotalCents = resolveCents(r, 'subtotalCents');
  const taxCents = resolveCents(r, 'taxCents');
  const albaFeeCents = resolveCents(r, 'albaFeeCents');
  const tipCents = resolveCents(r, 'tipCents');

  const createdAtText = r.createdAtText ? String(r.createdAtText) : '';
  const corp = r.corporateName ? clipText(r.corporateName, 32) : '';
  const store = r.storeName ? clipText(r.storeName, 32) : '';

  const method = r.method
    ? String(r.method)
    : r.paymentMethod
    ? String(r.paymentMethod)
    : '';

  const cardLine =
    r.brand || r.last4
      ? `Card • ${(r.brand || 'Card').toUpperCase()}${
          r.last4 ? ' • •••• ' + r.last4 : ''
        }`
      : '';

  const paymentId = r.paymentId ? String(r.paymentId) : '';
  const chargeId = r.chargeId ? String(r.chargeId) : '';
  const note = r.paymentNote
    ? clipText(r.paymentNote, 44)
    : r.note
    ? clipText(r.note, 44)
    : '';

  const lineItems = [
    {label: 'Subtotal', amount: money(subtotalCents)},
    {label: 'Sales Tax', amount: money(taxCents)},
    {label: 'Service Fee', amount: money(albaFeeCents)},
    {label: 'Tip', amount: money(tipCents)},
  ];

  const itemsHtml = lineItems
    .map(
      it => `
        <tr class="row">
          <td class="l">${escapeHtml(it.label)}</td>
          <td class="r">${escapeHtml(it.amount)}</td>
        </tr>
      `,
    )
    .join('');

  const copy = String(copyLabel || '').trim();

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
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
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

      .tiny { font-size: 12px; opacity: 0.9; margin-top: 8px; }

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

      ${copy ? `<div class="copyTag">${escapeHtml(copy)}</div>` : ''}

      <div class="divider"></div>

      ${
        createdAtText
          ? `<div class="meta"><span class="k">Transaction Date</span>: <span class="v">${escapeHtml(
              createdAtText,
            )}</span></div>`
          : ''
      }
      ${
        createdAtText
          ? `<div class="meta"><span class="k">This date reflects</span>: <span class="v">the time the transaction was processed</span></div>`
          : ''
      }
      ${
        corp
          ? `<div class="meta"><span class="k">Corporate</span>: <span class="v">${escapeHtml(
              corp,
            )}</span></div>`
          : ''
      }
      ${
        store
          ? `<div class="meta"><span class="k">Location</span>: <span class="v">${escapeHtml(
              store,
            )}</span></div>`
          : ''
      }

      <div class="divider"></div>

      ${
        method
          ? `<div class="meta"><span class="k">Payment Method</span>: <span class="v">${escapeHtml(
              method.toUpperCase(),
            )}</span></div>`
          : ''
      }
      ${
        cardLine
          ? `<div class="meta"><span class="v">${escapeHtml(
              cardLine,
            )}</span></div>`
          : ''
      }
      ${
        paymentId
          ? `<div class="tiny">Payment ID: ${escapeHtml(paymentId)}</div>`
          : ''
      }
      ${
        chargeId
          ? `<div class="tiny">Charge ID: ${escapeHtml(chargeId)}</div>`
          : ''
      }

      <div class="divider"></div>

      <table>
        ${itemsHtml}
      </table>

      <div class="totalWrap">
        <div class="totalRow">
          <div class="totalLabel">TOTAL</div>
          <div class="totalValue">${escapeHtml(totalText)}</div>
        </div>
      </div>

      ${note ? `<div class="tiny">Note: ${escapeHtml(note)}</div>` : ''}

      <div class="footer">
        <div class="thanks">Thank you for choosing AGPay</div>
        <div class="fine">Luxury-grade payments • Secure • Trusted</div>
      </div>
    </div>
  </body>
  </html>`;
}

async function readLastReceipt() {
  try {
    const creds = await Keychain.getInternetCredentials('agpayLastReceipt');
    if (!creds || !creds.password) return null;
    return JSON.parse(creds.password);
  } catch {
    return null;
  }
}

/**
 * ✅ selection = { corporateName, storeName, ownerId, ... }
 */
async function readSelectionFromKeychain() {
  try {
    const creds = await Keychain.getInternetCredentials('agpaySelection');
    if (!creds?.password) return null;
    return safeJsonParse(creds.password) || null;
  } catch {
    return null;
  }
}

/**
 * setInternetCredentials() throws if username OR password is empty.
 * We clear by storing a single space, and readers must trim().
 */
async function clearAgpayCommentFromKeychain() {
  try {
    await Keychain.setInternetCredentials('agpayComment', 'comment', ' ');
    return true;
  } catch (e) {
    console.log('Receipt => clearAgpayCommentFromKeychain error:', e);
    return false;
  }
}

function isValidEmail(email) {
  const e = String(email || '').trim();
  if (!e) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// --- local press helpers (so we don’t depend on ../ui/pressFX) ---
const pressFX = ({pressed}) =>
  pressed ? {opacity: 0.85, transform: [{scale: 0.99}]} : null;

const androidRipple = (color = 'rgba(255,255,255,0.12)') =>
  Platform.OS === 'android' ? {android_ripple: {color, borderless: false}} : {};

export default function ReceiptScreen({
  theme,
  receipt,
  onDone,
  onBack,
  onResetTxn,
}) {
  const [localReceipt, setLocalReceipt] = useState(receipt || null);

  // ✅ email UI state
  const [email, setEmail] = useState('');
  const [busyEmail, setBusyEmail] = useState(false);

  // ✅ selection-derived store name (optional)
  const [storeNameKC, setStoreNameKC] = useState('');

  const t = useMemo(() => {
    const bg = theme?.bg ?? '#020617';
    const card = theme?.card ?? '#050814';
    const inputBg = theme?.inputBg ?? '#111827';
    const text = theme?.text ?? '#ffffff';
    const muted = theme?.muted ?? '#9ca3af';
    const border = theme?.border ?? '#1f2937';
    const gold = theme?.gold ?? GOLD;
    const goldText = theme?.goldText ?? '#050814';
    return {bg, card, inputBg, text, muted, border, gold, goldText};
  }, [theme]);

  useEffect(() => {
    let mounted = true;

    setEmail('');

    readSelectionFromKeychain().then(sel => {
      if (!mounted) return;
      if (sel?.storeName) setStoreNameKC(String(sel.storeName));
    });

    if (receipt) {
      setLocalReceipt(receipt);
      return () => {
        mounted = false;
      };
    }

    readLastReceipt().then(saved => {
      if (mounted && saved) setLocalReceipt(saved);
    });

    return () => {
      mounted = false;
    };
  }, [receipt]);

  const methodUpper = useMemo(() => {
    const m =
      localReceipt?.method ||
      localReceipt?.paymentMethod ||
      receipt?.method ||
      receipt?.paymentMethod ||
      '';
    return String(m || '').toUpperCase();
  }, [localReceipt, receipt]);

  const totalCents =
    Number(localReceipt?.totalCents) ||
    Number(localReceipt?.grandTotalCents) ||
    Number(localReceipt?.amountCents) ||
    Number(localReceipt?.breakdown?.totalCents) ||
    0;

  const totalText =
    localReceipt?.totalLabel ||
    localReceipt?.amountText ||
    money(totalCents) ||
    '$0.00';

  /**
   * ✅ Email receipt (no printing dependency)
   */
  const handleEmailReceipt = useCallback(async () => {
    try {
      if (busyEmail) return;
      if (!localReceipt) {
        Alert.alert('No receipt', 'Receipt data is not available yet.');
        return;
      }

      const to = String(email || '').trim();
      if (!isValidEmail(to)) {
        Alert.alert('Invalid email', 'Please enter a valid email address.');
        return;
      }

      setBusyEmail(true);

      // Build HTML body for email
      const htmlClient = buildReceiptHtml(localReceipt, 'CLIENT COPY');

      const methodClean = String(
        methodUpper || localReceipt?.paymentMethod || '',
      ).toUpperCase();
      const paymentMethod =
        methodClean === 'CASH' ? 'CASH' : methodClean || 'CARD';

      const storeName =
        (storeNameKC && String(storeNameKC).trim()) ||
        localReceipt?.storeName ||
        localReceipt?.corporateName ||
        'AGPay';

      const payload = {
        to,
        storeName,
        createdAtText: localReceipt?.createdAtText || '',
        paymentMethod,
        receiptId:
          localReceipt?.paymentId ||
          localReceipt?.chargeId ||
          localReceipt?.receiptId ||
          '',

        subtotalText: money(resolveCents(localReceipt, 'subtotalCents')),
        taxText: money(resolveCents(localReceipt, 'taxCents')),
        tipText: money(resolveCents(localReceipt, 'tipCents')),
        totalText,

        items: [
          {
            name: 'Subtotal',
            qty: 1,
            priceText: money(resolveCents(localReceipt, 'subtotalCents')),
          },
          {
            name: 'Sales Tax',
            qty: 1,
            priceText: money(resolveCents(localReceipt, 'taxCents')),
          },
          {
            name: 'Service Fee',
            qty: 1,
            priceText: money(resolveCents(localReceipt, 'albaFeeCents')),
          },
          {
            name: 'Tip',
            qty: 1,
            priceText: money(resolveCents(localReceipt, 'tipCents')),
          },
        ].filter(x => x.priceText !== '$0.00'),

        notes:
          'Thank you for choosing AGPay. Your confirmation has been recorded securely. ' +
          'If anything looks unfamiliar, reply to this email and our team will assist promptly.',

        htmlClient,
      };

      console.log('📧 Email Receipt => POST', EMAIL_RECEIPT_URL);
      console.log('📧 Email Receipt => storeName:', storeName);
      console.log('📧 Email Receipt => paymentMethod:', paymentMethod);

      const resp = await fetch(EMAIL_RECEIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AGPAY-KEY': AGPAY_EMAIL_KEY,
        },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      console.log('📧 Email Receipt => HTTP', resp.status, text);

      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`);

      const json = safeJsonParse(text);
      if (json && json.ok === true) {
        Alert.alert('Sent', `Receipt emailed to:\n${to}`);
      } else {
        Alert.alert('Sent', `Receipt request completed.\n\nServer:\n${text}`);
      }

      await clearAgpayCommentFromKeychain();
    } catch (e) {
      console.log('EMAIL RECEIPT error:', e);
      Alert.alert('Email failed', String(e?.message || e));
    } finally {
      setBusyEmail(false);
    }
  }, [busyEmail, email, localReceipt, methodUpper, totalText, storeNameKC]);

  const handleBack = useCallback(() => {
    if (typeof onBack === 'function') return onBack();
    if (typeof onDone === 'function') return onDone();
  }, [onBack, onDone]);

  const handleDone = useCallback(async () => {
    await clearAgpayCommentFromKeychain();
    onResetTxn?.();
    onDone?.();
  }, [onDone, onResetTxn]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, {backgroundColor: t.bg}]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View
        style={[styles.card, {backgroundColor: t.card, borderColor: t.border}]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleBack}
            {...androidRipple('rgba(250,204,21,0.12)')}
            style={({pressed}) => [
              styles.backBtn,
              {borderColor: t.border, backgroundColor: t.inputBg},
              pressFX({pressed}),
            ]}>
            <Text style={[styles.backText, {color: t.text}]}>Back</Text>
          </Pressable>

          <Text style={[styles.title, {color: t.text}]}>Receipt</Text>

          <View style={{width: 60}} />
        </View>

        {/* Summary */}
        <View
          style={[
            styles.summaryBox,
            {backgroundColor: t.inputBg, borderColor: t.border},
          ]}>
          <Text style={[styles.summaryLine, {color: t.muted}]}>
            Method:{' '}
            <Text style={{color: t.text, fontWeight: '900'}}>
              {methodUpper || '—'}
            </Text>
          </Text>
          <Text style={[styles.summaryLine, {color: t.muted}]}>
            Total:{' '}
            <Text style={{color: t.gold, fontWeight: '900'}}>{totalText}</Text>
          </Text>
          <Text style={[styles.summaryLine, {color: t.muted}]}>
            Store:{' '}
            <Text style={{color: t.text, fontWeight: '900'}}>
              {storeNameKC ||
                localReceipt?.storeName ||
                localReceipt?.corporateName ||
                'AGPay'}
            </Text>
          </Text>
        </View>

        {/* ✅ Email box */}
        <View
          style={[
            styles.emailBox,
            {backgroundColor: t.inputBg, borderColor: t.border},
          ]}>
          <Text style={{color: t.muted, marginBottom: 6, fontSize: 12}}>
            Email receipt to
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="customer@email.com"
            placeholderTextColor={t.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            style={{
              color: t.text,
              fontSize: 15,
              padding: 0,
              margin: 0,
              fontWeight: '800',
            }}
          />
          {!email.trim() || isValidEmail(email) ? null : (
            <Text
              style={{
                color: '#ef4444',
                marginTop: 6,
                fontSize: 12,
                fontWeight: '800',
              }}>
              Please enter a valid email.
            </Text>
          )}
        </View>

        <Pressable
          onPress={handleEmailReceipt}
          disabled={busyEmail}
          {...androidRipple('rgba(250,204,21,0.10)')}
          style={({pressed}) => [
            styles.primaryBtn,
            {backgroundColor: t.inputBg, borderColor: t.border},
            busyEmail ? {opacity: 0.6} : null,
            pressFX({pressed}),
          ]}>
          <Text style={[styles.primaryText, {color: t.gold}]}>
            {busyEmail ? 'Sending…' : 'Email Receipt'}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleDone}
          {...androidRipple('rgba(0,0,0,0.10)')}
          style={({pressed}) => [
            styles.doneBtn,
            {backgroundColor: t.gold},
            pressFX({pressed}),
          ]}>
          <Text style={[styles.doneText, {color: t.goldText}]}>Done</Text>
        </Pressable>

        <Text style={[styles.note, {color: t.muted}]}>
          Printing is disabled in this Android build. Email receipt works.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, padding: 16, justifyContent: 'center'},
  card: {borderRadius: 22, padding: 18, borderWidth: 1},
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {fontSize: 22, fontWeight: '800'},

  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  backText: {fontSize: 13, fontWeight: '900'},

  summaryBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  summaryLine: {fontSize: 13, fontWeight: '800', marginBottom: 6},

  emailBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  primaryBtn: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    width: '100%',
  },
  primaryText: {fontSize: 16, fontWeight: '900'},

  doneBtn: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
  },
  doneText: {fontSize: 16, fontWeight: '900'},

  note: {marginTop: 10, fontSize: 12, fontWeight: '700', textAlign: 'center'},
});
