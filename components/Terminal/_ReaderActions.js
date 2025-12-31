// components/Terminal/ReaderActions.js
import React from 'react';
import {View, Button} from 'react-native';

export default function ReaderActions({
  styles,
  connecting,
  initialized,
  connectedReader,
  onConnect,
  onDisconnect,
}) {
  return (
    <View style={styles.buttonRow}>
      <View style={styles.buttonWrapper}>
        <Button
          title={connecting ? 'Connecting…' : 'Connect Tap to Pay (Simulated)'}
          onPress={onConnect}
          disabled={connecting || !initialized}
        />
      </View>

      {connectedReader && (
        <View style={styles.buttonWrapper}>
          <Button title="Disconnect" color="#a00" onPress={onDisconnect} />
        </View>
      )}
    </View>
  );
}
