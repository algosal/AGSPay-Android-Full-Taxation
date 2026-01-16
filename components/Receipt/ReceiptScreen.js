import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import RNPrint from 'react-native-print';

const GOLD = '#d4af37';

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function money(cents) {
  const n = Number(cents ?? NaN);
  if (!Number.isFinite(n)) return '';
  return '$' + (n / 100).toFixed(2);
}

function clipText(value, max = 30) {
  const s = String(value || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function nOrNull(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function buildReceiptHtml(receipt) {
  const r = receipt || {};

  // Always use cents fields for math, text is display-only.
  const totalCents =
    Number(r.totalCents) ||
    Number(r.grandTotalCents) ||
    Number(r.amountCents) ||
    0;

  // Show total even if 0 (you said real tests are always >= $1)
  const totalText = r.amountText || money(totalCents) || '(missing)';

  const subtotalCents = nOrNull(r.subtotalCents);
  const taxCents = nOrNull(r.taxCents);
  const albaFeeCents = nOrNull(r.albaFeeCents);
  const tipCents = nOrNull(r.tipCents);

  // Compute subtotal if not provided
  const computedSubtotalCents =
    subtotalCents === null
      ? Math.max(
          0,
          totalCents - (taxCents || 0) - (albaFeeCents || 0) - (tipCents || 0),
        )
      : null;

  const finalSubtotalCents =
    subtotalCents !== null ? subtotalCents : computedSubtotalCents;

  const createdAtText = r.createdAtText ? String(r.createdAtText) : '';
  const corp = r.corporateName ? clipText(r.corporateName) : '';
  const store = r.storeName ? clipText(r.storeName) : '';

  const method = r.paymentMethod ? String(r.paymentMethod) : '';
  const cardLine =
    r.brand || r.last4
      ? `Card: ${r.brand || 'Card'}${r.last4 ? ' **** ' + r.last4 : ''}`
      : '';

  const paymentId = r.paymentId ? String(r.paymentId) : '';
  const chargeId = r.chargeId ? String(r.chargeId) : '';
  const note = r.note ? clipText(r.note, 36) : '';

  const rows = [];

  // Print these ALWAYS if present; if missing, skip.
  if (finalSubtotalCents !== null)
    rows.push(['Subtotal', money(finalSubtotalCents)]);
  if (taxCents !== null) rows.push(['Tax', money(taxCents)]);
  if (albaFeeCents !== null) rows.push(['Alba Fee', money(albaFeeCents)]);
  if (tipCents !== null) rows.push(['Tip', money(tipCents)]);

  rows.push(['TOTAL', totalText]);

  const rowsHtml = rows
    .map(([label, amount]) => {
      const isTotal = label === 'TOTAL';
      return `
        <tr class="${isTotal ? 'total' : ''}">
          <td class="l">${escapeHtml(label)}</td>
          <td class="r">${escapeHtml(amount)}</td>
        </tr>`;
    })
    .join('');

  return `
<html>
<head>
  <meta charset="utf-8" />
  <style>
    /* Force 58mm portrait */
    @page { size: 58mm auto; margin: 0; }

    html, body {
      width: 58mm;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: monospace;
      font-size: 20px;
      line-height: 1.15;
      box-sizing: border-box;
    }

    .wrap { padding: 0 2mm; } /* tiny safe padding */
    .center { text-align: center; }
    .bold { font-weight: 900; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }

    .meta { margin: 2px 0; }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    td {
      padding: 2px 0;
      vertical-align: top;
      overflow: hidden;
    }

    td.l {
      width: 62%;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    td.r {
      width: 38%;
      text-align: right;
      white-space: nowrap;
    }

    tr.total td {
      font-weight: 900;
      padding-top: 6px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="center bold">AGPAY RECEIPT</div>
    <div class="line"></div>

    ${
      createdAtText
        ? `<div class="meta">Date: ${escapeHtml(createdAtText)}</div>`
        : ''
    }
    ${
      corp
        ? `<div class="meta">Corp: <span class="bold">${escapeHtml(
            corp,
          )}</span></div>`
        : ''
    }
    ${
      store
        ? `<div class="meta">Store: <span class="bold">${escapeHtml(
            store,
          )}</span></div>`
        : ''
    }

    <div class="line"></div>

    ${method ? `<div class="meta">Method: ${escapeHtml(method)}</div>` : ''}
    ${cardLine ? `<div class="meta">${escapeHtml(cardLine)}</div>` : ''}
    ${
      paymentId
        ? `<div class="meta">Payment ID: ${escapeHtml(paymentId)}</div>`
        : ''
    }
    ${
      chargeId
        ? `<div class="meta">Charge ID: ${escapeHtml(chargeId)}</div>`
        : ''
    }

    <div class="line"></div>

    <table>
      ${rowsHtml}
    </table>

    ${
      note
        ? `<div class="meta" style="margin-top:6px;">Note: ${escapeHtml(
            note,
          )}</div>`
        : ''
    }

    <div style="margin-top:10px;" class="center">Thank you!</div>
    <div style="height:10px;"></div>
  </div>
</body>
</html>`;
}

export default function ReceiptScreen({receipt, onDone, onLogout, onBack}) {
  async function handlePrint() {
    try {
      const html = buildReceiptHtml(receipt);
      await RNPrint.print({html});
    } catch (e) {
      console.log('PRINT error:', e);
      Alert.alert('Print failed', String(e?.message || e));
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Receipt</Text>

          <View style={{flexDirection: 'row', gap: 12}}>
            {!!onBack && (
              <TouchableOpacity onPress={onBack}>
                <Text style={styles.back}>Back</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={onLogout}>
              <Text style={styles.logout}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.printBtn} onPress={handlePrint}>
          <Text style={styles.printText}>Print</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020617',
    padding: 16,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#050814',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {color: 'white', fontSize: 22, fontWeight: '800'},
  logout: {fontSize: 14, color: GOLD, fontWeight: '800'},
  back: {fontSize: 14, color: '#9ca3af', fontWeight: '800'},

  printBtn: {
    marginTop: 16,
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  printText: {color: GOLD, fontSize: 16, fontWeight: '800'},

  doneBtn: {
    marginTop: 12,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: {color: '#050814', fontSize: 16, fontWeight: '900'},
});
