import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import RNPrint from "react-native-print";

const GOLD = "#d4af37";

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildReceiptText(receipt) {
  const r = receipt || {};
  const line = "--------------------------------";

  const amount =
    r.amountText ||
    (r.amountCents ? "$" + (Number(r.amountCents) / 100).toFixed(2) : "");

  const parts = [
    "AGPAY RECEIPT",
    line,
    r.createdAtText ? "Date: " + r.createdAtText : "",
    r.corporateName ? "Corp: " + r.corporateName : "",
    r.storeName ? "Store: " + r.storeName : "",
    line,
    r.paymentMethod ? "Method: " + r.paymentMethod : "",
    r.brand ? "Card: " + r.brand + (r.last4 ? " **** " + r.last4 : "") : "",
    r.paymentId ? "Payment ID: " + r.paymentId : "",
    line,
    amount ? "TOTAL: " + amount : "TOTAL: (missing)",
    r.note ? "Note: " + r.note : "",
    "",
    "Thank you!",
    "",
  ];

  return parts.filter(Boolean).join("\n");
}

export default function ReceiptScreen({ receipt, onDone, onLogout }) {
  const amountText = receipt?.amountText || "-";
  const brand = receipt?.brand || "Card";
  const last4 = receipt?.last4 ? "**** " + receipt.last4 : "-";
  const paymentId = receipt?.paymentId || "";

  async function handlePrint() {
    try {
      const text = buildReceiptText(receipt);
      const safeText = escapeHtml(text);

      const html =
        "<html>" +
        '<body style="font-family: monospace; font-size: 14px; white-space: pre;">' +
        safeText +
        "</body>" +
        "</html>";

      await RNPrint.print({ html });
    } catch (e) {
      console.log("PRINT error:", e);
      Alert.alert("Print failed", String(e?.message || e));
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Receipt</Text>

          <TouchableOpacity onPress={onLogout} accessibilityRole="button">
            <Text style={styles.logout}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Amount</Text>
          <Text style={styles.value}>{amountText}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Payment Method</Text>
          <Text style={styles.value}>
            {brand} {last4}
          </Text>
        </View>

        {!!paymentId && (
          <View style={styles.row}>
            <Text style={styles.label}>Payment ID</Text>
            <Text style={styles.valueSmall}>{paymentId}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.printBtn}
          onPress={handlePrint}
          accessibilityRole="button"
        >
          <Text style={styles.printText}>Print</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={onDone}
          accessibilityRole="button"
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#020617",
    padding: 16,
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#050814",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { color: "white", fontSize: 22, fontWeight: "800" },
  logout: { fontSize: 14, color: GOLD, fontWeight: "800" },

  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
  },
  label: { color: "#9ca3af", fontSize: 13, marginBottom: 4 },
  value: { color: "white", fontSize: 16, fontWeight: "700" },
  valueSmall: { color: "#e5e7eb", fontSize: 12 },

  printBtn: {
    marginTop: 16,
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  printText: { color: GOLD, fontSize: 16, fontWeight: "800" },

  doneBtn: {
    marginTop: 12,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  doneText: { color: "#050814", fontSize: 16, fontWeight: "900" },
});
