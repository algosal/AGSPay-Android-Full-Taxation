//Connects to the blue tooth reader and provides terminal status via context. Adjust the connectionTokenUrl to your backend endpoint that returns a connection token. See the README for details on setting up your backend.

import React, {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Alert, PermissionsAndroid, Platform} from 'react-native';
import {
  StripeTerminal,
  ConnectionStatus,
  DiscoveryMethod,
} from '@stripe/stripe-terminal-react-native';

export const TerminalContext = createContext(null);

/**
 * ✅ IMPORTANT:
 * - Stripe Terminal discovery on Android requires:
 *   - Bluetooth ON
 *   - Location permission GRANTED
 *   - Location services ON (device toggle)
 *   - BLUETOOTH_SCAN + BLUETOOTH_CONNECT on Android 12+
 */
async function ensureAndroidBlePermissions() {
  if (Platform.OS !== 'android') return true;

  const perms = [];

  // Android 12+ bluetooth runtime permissions
  if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN) {
    perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
  }
  if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) {
    perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  }

  // Location required for BLE discovery
  perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);

  const results = await PermissionsAndroid.requestMultiple(perms);

  const scanOk =
    !PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN ||
    results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted';

  const connectOk =
    !PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT ||
    results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted';

  const locOk =
    results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted';

  return scanOk && connectOk && locOk;
}

export default function TerminalProvider({
  children,
  connectionTokenUrl, // ✅ your backend endpoint that returns a connection token
}) {
  const [terminalStatusLine, setTerminalStatusLine] = useState('');
  const [readerStatus, setReaderStatus] = useState({
    connected: false,
    label: 'Tap to Pay not connected',
  });
  const [isReaderBusy, setIsReaderBusy] = useState(false);

  const initializedRef = useRef(false);

  const fetchConnectionToken = useCallback(async () => {
    // ✅ JWT is how you auth your backend. Adjust if you use Keychain instead.
    const token =
      global?.localStorage?.getItem?.('agpay_authToken') || ''; /* web-like */

    // If you're not in a webview environment, use your normal auth storage.
    // Example: const token = auth?.token || "";

    const res = await fetch(connectionTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? {Authorization: token} : {}),
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();

    // Accept a few common keys
    const secret =
      data?.secret ||
      data?.connectionToken ||
      data?.token ||
      data?.client_secret;

    if (!secret) {
      console.log('connection token response:', data);
      throw new Error('Missing Stripe Terminal connection token from backend');
    }

    return secret;
  }, [connectionTokenUrl]);

  const ensureInitialized = useCallback(async () => {
    if (initializedRef.current) return true;

    setTerminalStatusLine('Initializing Terminal…');
    const initRes = await StripeTerminal.initialize({
      fetchConnectionToken,
    });

    if (!initRes?.initialized) {
      throw new Error(
        initRes?.error?.message || 'Stripe Terminal initialize failed',
      );
    }

    initializedRef.current = true;
    return true;
  }, [fetchConnectionToken]);

  const onDisconnectReader = useCallback(async () => {
    try {
      setIsReaderBusy(true);
      setTerminalStatusLine('Disconnecting reader…');

      await ensureInitialized();

      const res = await StripeTerminal.disconnectReader();
      if (res?.error) throw new Error(res.error.message);

      setReaderStatus({connected: false, label: 'Tap to Pay not connected'});
      setTerminalStatusLine('Disconnected.');
    } catch (e) {
      console.log('disconnectReader error:', e);
      Alert.alert('Disconnect failed', String(e?.message || e));
      setTerminalStatusLine('');
      throw e;
    } finally {
      setIsReaderBusy(false);
    }
  }, [ensureInitialized]);

  const onConnectReader = useCallback(async () => {
    try {
      if (isReaderBusy) return;

      setIsReaderBusy(true);
      setTerminalStatusLine('Requesting permissions…');

      const ok = await ensureAndroidBlePermissions();
      if (!ok) {
        throw new Error(
          'Bluetooth/Location permissions not granted. Enable Nearby Devices + Location.',
        );
      }

      await ensureInitialized();

      const connStatus = await StripeTerminal.getConnectionStatus();
      if (connStatus === ConnectionStatus.CONNECTED) {
        setReaderStatus({connected: true, label: 'Tap to Pay connected'});
        setTerminalStatusLine('Reader already connected.');
        return;
      }

      setTerminalStatusLine('Searching for Bluetooth readers…');

      const discoverRes = await StripeTerminal.discoverReaders({
        discoveryMethod: DiscoveryMethod.BLUETOOTH_SCAN,
        simulated: false,
      });

      if (discoverRes?.error) {
        throw new Error(discoverRes.error.message || 'discoverReaders failed');
      }

      const readers = discoverRes?.discoveredReaders || [];
      if (!readers.length) {
        throw new Error(
          'No readers found. Ensure: Bluetooth ON, Location ON (device toggle), reader is awake and in pairing mode.',
        );
      }

      // For now pick the first one (we can add a picker later)
      const reader = readers[0];
      const label = reader?.label || reader?.serialNumber || 'Reader';

      setTerminalStatusLine(`Found ${label}. Connecting…`);

      const connectRes = await StripeTerminal.connectBluetoothReader({
        reader,
      });

      if (connectRes?.error) {
        throw new Error(
          connectRes.error.message || 'connectBluetoothReader failed',
        );
      }

      setReaderStatus({connected: true, label: `Connected: ${label}`});
      setTerminalStatusLine('Connected ✅');
    } catch (e) {
      console.log('connectReader error:', e);
      Alert.alert('Connect failed', String(e?.message || e));
      setReaderStatus({connected: false, label: 'Tap to Pay not connected'});
      setTerminalStatusLine('');
      throw e;
    } finally {
      setIsReaderBusy(false);
    }
  }, [ensureInitialized, isReaderBusy]);

  const value = useMemo(
    () => ({
      onConnectReader,
      onDisconnectReader,
      readerStatus,
      isReaderBusy,
      terminalStatusLine,
      setTerminalStatusLine,
      setReaderStatus,
    }),
    [
      onConnectReader,
      onDisconnectReader,
      readerStatus,
      isReaderBusy,
      terminalStatusLine,
    ],
  );

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
}
