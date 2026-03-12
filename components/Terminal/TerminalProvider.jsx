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

  if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN) {
    perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
  }
  if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) {
    perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  }

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

function normalizeBatteryPercent(raw) {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null;

  if (raw >= 0 && raw <= 1) {
    return Math.round(raw * 100);
  }

  if (raw >= 0 && raw <= 100) {
    return Math.round(raw);
  }

  return null;
}

export default function TerminalProvider({children, connectionTokenUrl}) {
  const [terminalStatusLine, setTerminalStatusLine] = useState('');
  const [readerStatus, setReaderStatus] = useState({
    connected: false,
    label: 'Tap to Pay not connected',
    batteryLevel: null,
    batteryStatus: null,
    isCharging: false,
  });
  const [isReaderBusy, setIsReaderBusy] = useState(false);

  const initializedRef = useRef(false);

  const fetchConnectionToken = useCallback(async () => {
    const token = global?.localStorage?.getItem?.('agpay_authToken') || '';

    const res = await fetch(connectionTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? {Authorization: token} : {}),
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();

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

  const publishDisconnected = useCallback(() => {
    setReaderStatus({
      connected: false,
      label: 'Tap to Pay not connected',
      batteryLevel: null,
      batteryStatus: null,
      isCharging: false,
    });
  }, []);

  const tryRefreshConnectedReaderSnapshot = useCallback(async () => {
    try {
      const connectedReaderRes = await StripeTerminal.getConnectedReader();
      const connectedReader =
        connectedReaderRes?.reader || connectedReaderRes || null;

      const nextBattery = normalizeBatteryPercent(
        connectedReader?.batteryLevel,
      );

      setReaderStatus(prev => ({
        ...prev,
        connected: true,
        label:
          connectedReader?.label ||
          connectedReader?.serialNumber ||
          prev?.label ||
          'Tap to Pay connected',
        serialNumber:
          connectedReader?.serialNumber || prev?.serialNumber || null,
        id: connectedReader?.id || prev?.id || null,
        batteryLevel:
          nextBattery !== null ? nextBattery : prev?.batteryLevel ?? null,
        batteryStatus:
          connectedReader?.batteryStatus || prev?.batteryStatus || null,
        isCharging:
          typeof connectedReader?.isCharging === 'boolean'
            ? connectedReader.isCharging
            : !!prev?.isCharging,
      }));
    } catch (e) {
      console.log('getConnectedReader battery refresh error:', e);
    }
  }, []);

  const onDisconnectReader = useCallback(async () => {
    try {
      setIsReaderBusy(true);
      setTerminalStatusLine('Disconnecting reader…');

      await ensureInitialized();

      const res = await StripeTerminal.disconnectReader();
      if (res?.error) throw new Error(res.error.message);

      publishDisconnected();
      setTerminalStatusLine('Disconnected.');
    } catch (e) {
      console.log('disconnectReader error:', e);
      Alert.alert('Disconnect failed', String(e?.message || e));
      setTerminalStatusLine('');
      throw e;
    } finally {
      setIsReaderBusy(false);
    }
  }, [ensureInitialized, publishDisconnected]);

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
        setReaderStatus(prev => ({
          ...prev,
          connected: true,
          label: prev?.label || 'Tap to Pay connected',
        }));
        setTerminalStatusLine('Reader already connected.');

        await tryRefreshConnectedReaderSnapshot();
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

      setReaderStatus(prev => ({
        ...prev,
        connected: true,
        label: `Connected: ${label}`,
        serialNumber: reader?.serialNumber || null,
        id: reader?.id || null,
        batteryLevel: normalizeBatteryPercent(reader?.batteryLevel),
        batteryStatus: reader?.batteryStatus || null,
        isCharging:
          typeof reader?.isCharging === 'boolean' ? reader.isCharging : false,
      }));

      setTerminalStatusLine('Connected ✅');

      setTimeout(async () => {
        await tryRefreshConnectedReaderSnapshot();
      }, 1500);
    } catch (e) {
      console.log('connectReader error:', e);
      Alert.alert('Connect failed', String(e?.message || e));
      publishDisconnected();
      setTerminalStatusLine('');
      throw e;
    } finally {
      setIsReaderBusy(false);
    }
  }, [
    ensureInitialized,
    isReaderBusy,
    publishDisconnected,
    tryRefreshConnectedReaderSnapshot,
  ]);

  const onRefreshReaderStatus = useCallback(async () => {
    try {
      if (isReaderBusy) return false;

      const status = String(terminalStatusLine || '').toLowerCase();
      const isBusyStatus =
        status.includes('creating paymentintent') ||
        status.includes('retrieving intent') ||
        status.includes('present card') ||
        status.includes('tap card now') ||
        status.includes('processing') ||
        status.includes('saving transaction');

      if (isBusyStatus) {
        Alert.alert(
          'Reader busy',
          'Please refresh only when the terminal is idle.',
        );
        return false;
      }

      setIsReaderBusy(true);
      setTerminalStatusLine('Refreshing reader status…');

      await ensureInitialized();

      try {
        const disconnectRes = await StripeTerminal.disconnectReader();
        if (disconnectRes?.error) {
          console.log('refresh disconnect warning:', disconnectRes.error);
        }
      } catch (e) {
        console.log('refresh disconnect exception:', e);
      }

      publishDisconnected();

      await new Promise(resolve => setTimeout(resolve, 1000));

      const ok = await ensureAndroidBlePermissions();
      if (!ok) {
        throw new Error(
          'Bluetooth/Location permissions not granted. Enable Nearby Devices + Location.',
        );
      }

      setTerminalStatusLine('Reconnecting reader…');

      const discoverRes = await StripeTerminal.discoverReaders({
        discoveryMethod: DiscoveryMethod.BLUETOOTH_SCAN,
        simulated: false,
      });

      if (discoverRes?.error) {
        throw new Error(discoverRes.error.message || 'discoverReaders failed');
      }

      const readers = discoverRes?.discoveredReaders || [];
      if (!readers.length) {
        throw new Error('No readers found during refresh.');
      }

      const reader = readers[0];
      const label = reader?.label || reader?.serialNumber || 'Reader';

      const connectRes = await StripeTerminal.connectBluetoothReader({
        reader,
      });

      if (connectRes?.error) {
        throw new Error(
          connectRes.error.message || 'connectBluetoothReader failed',
        );
      }

      setReaderStatus(prev => ({
        ...prev,
        connected: true,
        label: `Connected: ${label}`,
        serialNumber: reader?.serialNumber || null,
        id: reader?.id || null,
        batteryLevel: normalizeBatteryPercent(reader?.batteryLevel),
        batteryStatus: reader?.batteryStatus || null,
        isCharging:
          typeof reader?.isCharging === 'boolean' ? reader.isCharging : false,
      }));

      setTerminalStatusLine('Reader refreshed');

      setTimeout(async () => {
        await tryRefreshConnectedReaderSnapshot();
      }, 1500);

      return true;
    } catch (e) {
      console.log('refreshReaderStatus error:', e);
      Alert.alert('Refresh failed', String(e?.message || e));
      setTerminalStatusLine('');
      return false;
    } finally {
      setIsReaderBusy(false);
    }
  }, [
    ensureInitialized,
    isReaderBusy,
    publishDisconnected,
    terminalStatusLine,
    tryRefreshConnectedReaderSnapshot,
  ]);

  const value = useMemo(
    () => ({
      onConnectReader,
      onDisconnectReader,
      onRefreshReaderStatus,
      readerStatus,
      isReaderBusy,
      terminalStatusLine,
      setTerminalStatusLine,
      setReaderStatus,
    }),
    [
      onConnectReader,
      onDisconnectReader,
      onRefreshReaderStatus,
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
