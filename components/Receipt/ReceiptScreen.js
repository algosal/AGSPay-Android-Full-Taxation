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
import {pressFX, androidRipple} from '../ui/pressFX';

const GOLD = '#d4af37';

// ✅ Stub URL for now (replace later with real API)
const EMAIL_RECEIPT_URL = 'https://example.com/coming-soon-email-receipt';

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
 * ✅ Builds receipt HTML (kept for later server-side emailing)
 */
function buildReceiptHtml(receipt, copyLabel) {
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

  const safeCopy = String(copyLabel || '').trim();

  return `
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: 58mm auto; margin: 0; }
      html, body { width: 58mm; margin: 0; padding: 0; background: #fff; }
      body {
        font-family: monospace;
        font-size: 18px;
        line-height: 1.15;
        color: #000;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        box-sizing: border-box;
      }
      .wrap { padding: 0 1.2mm; }

      .brand { text-align: center; margin-top: 6px; }
      .brand .logo { font-weight: 900; letter-spacing: 2px; font-size: 22px; }
      .brand .sub { margin-top: 2px; font-size: 13px; letter-spacing: 1.2px; text-transform: uppercase; }

      .copy {
        text-align: center;
        margin-top: 6px;
        font-size: 13px;
        font-weight: 900;
        letter-spacing: 1px;
        text-transform: uppercase;
      }

      .divider { border-top: 1px solid #000; margin: 8px 0; }

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
        padding: 6px 0;
        margin-top: 6px;
      }
      .totalRow { display: flex; justify-content: space-between; align-items: baseline; }
      .totalLabel { font-size: 16px; font-weight: 900; letter-spacing: 1px; }
      .totalValue { font-size: 22px; font-weight: 900; }

      .tiny { font-size: 12px; opacity: 0.9; margin-top: 6px; }

      .footer { text-align: center; margin-top: 10px; padding-bottom: 10px; }
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

      ${safeCopy ? `<div class="copy">${escapeHtml(safeCopy)}</div>` : ''}

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
 * ✅ IMPORTANT (Android):
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

// Basic email validation (good enough for UI)
function isValidEmail(email) {
  const e = String(email || '').trim();
  if (!e) return false;
  // Simple + practical
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// Try to prefill email from Keychain (best-effort)
async function readAnyKnownEmail() {
  try {
    // some apps store login as generic password
    const gp = await Keychain.getGenericPassword();
    const maybeUser = gp?.username ? String(gp.username) : '';
    if (isValidEmail(maybeUser)) return maybeUser;
  } catch {}

  try {
    // or session json might have email
    const internet = await Keychain.getInternetCredentials('agpayAuth');
    if (internet?.password) {
      const parsed = JSON.parse(internet.password);
      const maybeEmail =
        parsed?.email || parsed?.user_email || parsed?.username || '';
      if (isValidEmail(maybeEmail)) return String(maybeEmail);
    }
  } catch {}

  return '';
}

export default function ReceiptScreen({
  theme,
  receipt,
  onDone,
  onBack,
  onResetTxn,
}) {
  const [localReceipt, setLocalReceipt] = useState(receipt || null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');

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

    if (receipt) {
      setLocalReceipt(receipt);
    } else {
      readLastReceipt().then(saved => {
        if (mounted && saved) setLocalReceipt(saved);
      });
    }

    // Prefill email (best-effort)
    readAnyKnownEmail().then(e => {
      if (mounted && e) setEmail(e);
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

  const handleEmailReceipt = useCallback(async () => {
    try {
      if (busy) return;
      if (!localReceipt) {
        Alert.alert('No receipt', 'Receipt data is not available yet.');
        return;
      }

      const to = String(email || '').trim();
      if (!isValidEmail(to)) {
        Alert.alert('Invalid email', 'Please enter a valid email address.');
        return;
      }

      setBusy(true);

      // Generate HTML for later backend use (client + vendor)
      const htmlClient = buildReceiptHtml(localReceipt, 'CLIENT COPY');
      const htmlVendor = buildReceiptHtml(localReceipt, "VENDOR'S COPY");

      console.log('📧 Email Receipt (stub) to:', to);
      console.log('📧 Email Receipt (stub) total:', totalText);
      console.log('📧 Email Receipt (stub) client length:', htmlClient.length);
      console.log('📧 Email Receipt (stub) vendor length:', htmlVendor.length);

      // ✅ OPTIONAL: attempt a stub POST (safe to fail)
      // This is intentionally "coming soon" and should not block your flow.
      try {
        const payload = {
          to,
          createdAtText: localReceipt?.createdAtText || '',
          totalCents,
          totalText,
          method: methodUpper,
          receipt: localReceipt,
          htmlClient,
          htmlVendor,
        };

        const resp = await fetch(EMAIL_RECEIPT_URL, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        });

        // We do not care if it fails right now; it’s a stub.
        console.log('📧 Email stub HTTP:', resp.status);
      } catch (e) {
        console.log('📧 Email stub request failed (expected for now):', e);
      }

      Alert.alert(
        'Email Receipt (Coming Soon)',
        `Email: ${to}\nTotal: ${totalText}\n\nReceipt emailing will be enabled soon. This confirms the email input + payload generation works.`,
      );

      await clearAgpayCommentFromKeychain();
    } catch (e) {
      console.log('EMAIL RECEIPT error:', e);
      Alert.alert('Email failed', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [busy, email, localReceipt, methodUpper, totalCents, totalText]);

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
        </View>

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
          disabled={busy}
          {...androidRipple('rgba(250,204,21,0.10)')}
          style={({pressed}) => [
            styles.primaryBtn,
            {backgroundColor: t.inputBg, borderColor: t.border},
            busy ? {opacity: 0.6} : null,
            pressFX({pressed}),
          ]}>
          <Text style={[styles.primaryText, {color: t.gold}]}>
            {busy ? 'Preparing…' : 'Email Receipt'}
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
          Phone build: printing disabled. Email delivery is coming soon.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
  },
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
  summaryLine: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },

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
