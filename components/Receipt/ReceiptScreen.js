// components/Receipt/ReceiptScreen.js
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {View, Text, Pressable, StyleSheet, Alert} from 'react-native';
import RNPrint from 'react-native-print';
import * as Keychain from 'react-native-keychain';
import {pressFX, androidRipple} from '../ui/pressFX';

const GOLD = '#d4af37';

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

function buildReceiptHtml(receipt) {
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
 *
 * This ONLY touches service: 'agpayComment' (NOT 'agpaySelection').
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

export default function ReceiptScreen({
  theme,
  receipt,
  onDone,
  onBack,
  onResetTxn,
}) {
  const [localReceipt, setLocalReceipt] = useState(receipt || null);

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
      return;
    }

    readLastReceipt().then(saved => {
      if (mounted && saved) setLocalReceipt(saved);
    });

    return () => {
      mounted = false;
    };
  }, [receipt]);

  const handlePrint = useCallback(async () => {
    try {
      if (!localReceipt) {
        Alert.alert('No receipt', 'Receipt data is not available yet.');
        return;
      }
      const html = buildReceiptHtml(localReceipt);
      await RNPrint.print({html});

      // ✅ NEW: clear comment after successful print too
      await clearAgpayCommentFromKeychain();
    } catch (e) {
      console.log('PRINT error:', e);
      Alert.alert('Print failed', String(e?.message || e));
    }
  }, [localReceipt]);

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
    <View style={[styles.root, {backgroundColor: t.bg}]}>
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

        <Pressable
          onPress={handlePrint}
          {...androidRipple('rgba(250,204,21,0.10)')}
          style={({pressed}) => [
            styles.printBtn,
            {backgroundColor: t.inputBg, borderColor: t.border},
            pressFX({pressed}),
          ]}>
          <Text style={[styles.printText, {color: t.gold}]}>Print</Text>
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
          Receipt prints on a 58mm roll printer.
        </Text>
      </View>
    </View>
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

  printBtn: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    width: '100%',
  },
  printText: {fontSize: 16, fontWeight: '900'},

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
