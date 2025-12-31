// components/Terminal/ReaderStatusCard.js
import React from 'react';
import {View, Text} from 'react-native';

export default function ReaderStatusCard({
  styles,
  initialized,
  supportLabel,
  connectedReader,
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Reader status</Text>

      <Text style={styles.statusRow}>
        <Text style={styles.statusLabel}>SDK initialized: </Text>
        <Text style={styles.statusValue}>
          {initialized ? '✅ Ready' : '⏳ Initializing'}
        </Text>
      </Text>

      <Text style={styles.statusRow}>
        <Text style={styles.statusLabel}>Tap to Pay support: </Text>
        <Text style={styles.statusValue}>{supportLabel}</Text>
      </Text>

      <Text style={[styles.statusRow, {marginBottom: 12}]}>
        <Text style={styles.statusLabel}>Reader: </Text>
        <Text style={styles.statusValue}>
          {connectedReader
            ? connectedReader.label || 'Connected'
            : 'Not connected'}
        </Text>
      </Text>
    </View>
  );
}
