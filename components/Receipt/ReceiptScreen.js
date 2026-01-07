import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';

const GOLD = '#d4af37';

export default function ReceiptScreen({receipt, onDone, onLogout}) {
  const amountText = receipt?.amountText || '—';
  const brand = receipt?.brand || 'Card';
  const last4 = receipt?.last4 ? `•••• ${receipt.last4}` : '—';
  const paymentId = receipt?.paymentId || '';

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Receipt</Text>
          <TouchableOpacity onPress={onLogout}>
            <Text style={styles.logout}>⎋</Text>
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
          onPress={() => Alert.alert('Print', 'Printing will be added next.')}>
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
  logout: {fontSize: 22, color: GOLD},
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  label: {color: '#9ca3af', fontSize: 12, marginBottom: 4},
  value: {color: 'white', fontSize: 16, fontWeight: '800'},
  valueSmall: {color: 'white', fontSize: 12, fontWeight: '700'},
  printBtn: {
    marginTop: 16,
    backgroundColor: GOLD,
    paddingVertical: 14,
    borderRadius: 16,
  },
  printText: {
    color: '#020617',
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 16,
  },
  doneBtn: {
    marginTop: 10,
    backgroundColor: '#0b1224',
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingVertical: 14,
    borderRadius: 16,
  },
  doneText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 15,
  },
});
