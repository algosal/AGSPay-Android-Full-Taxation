import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import * as Keychain from 'react-native-keychain';

const STORES_URL =
  'https://kvscjsddkd.execute-api.us-east-2.amazonaws.com/prod/VendioStores';

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export default function StoreSelectScreen({
  corporate,
  onSelectionCompleted,
  onBack,
  onLogout,
}) {
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState([]);
  const [saving, setSaving] = useState(false);

  const corporateId = corporate?.corporateId || null;
  const corporateName =
    corporate?.corporateName || corporate?.dbaName || 'Corporate';

  useEffect(() => {
    if (!corporateId) {
      Alert.alert('Missing corporate', 'Please select a corporate first.');
      onBack?.(); // HARD STOP: force back to corporate select
      return;
    }
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corporateId]);

  async function loadStores() {
    try {
      setLoading(true);

      const authCreds = await Keychain.getInternetCredentials('agpayAuth');
      if (!authCreds || !authCreds.password) {
        Alert.alert('Auth error', 'Missing authentication context.');
        return;
      }

      const auth = safeJsonParse(authCreds.password) || {};
      const token = auth.token;

      console.log('STORES → fetching with JWT for corporateId:', corporateId);

      const resp = await fetch(STORES_URL, {
        method: 'GET',
        headers: {
          Authorization: token, // RAW JWT — NO Bearer
          'Content-Type': 'application/json',
        },
      });

      const text = await resp.text();

      if (!resp.ok) {
        console.log('STORES → error response:', text);
        Alert.alert('Error', 'Failed to load stores.');
        return;
      }

      const data = safeJsonParse(text);
      console.log(
        'STORES → received count:',
        Array.isArray(data) ? data.length : 0,
      );

      setStores(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('STORES → exception:', e);
      Alert.alert('Error', 'Unable to load stores.');
    } finally {
      setLoading(false);
    }
  }

  const filteredStores = useMemo(() => {
    if (!Array.isArray(stores) || !corporateId) return [];
    return stores.filter(s => s?.corporateId === corporateId);
  }, [stores, corporateId]);

  async function handlePickStore(store) {
    try {
      if (!store) return;

      setSaving(true);

      // Read auth context for ownerId
      const authCreds = await Keychain.getInternetCredentials('agpayAuth');
      const auth = authCreds?.password
        ? safeJsonParse(authCreds.password)
        : null;

      if (!auth) {
        Alert.alert('Auth error', 'Missing authentication context.');
        return;
      }

      const ownerUuid =
        auth.ownerIdRaw ||
        auth.ownerId ||
        auth.userId ||
        auth.profile?.userId ||
        null;

      if (!ownerUuid) {
        Alert.alert('Error', 'OwnerId missing; please log in again.');
        return;
      }

      // CorporateRef = "<uuid>#<epoch>"
      const corpUuid = corporate?.corporateUuid;
      const corpEpoch = corporate?.createdAt || corporate?.corporateEpoch;

      if (!corpUuid || !corpEpoch) {
        Alert.alert('Error', 'Corporate reference missing.');
        return;
      }

      const corporateRef = `${corpUuid}#${Math.trunc(Number(corpEpoch))}`;

      // StoreRef = "<uuid>#<epoch>"
      const storeUuid = store?.storeUuid;
      const storeEpoch = store?.storeEpoch || store?.createdAt;

      if (!storeUuid || !storeEpoch) {
        Alert.alert('Error', 'Store reference missing.');
        return;
      }

      const storeRef = `${storeUuid}#${Math.trunc(Number(storeEpoch))}`;

      const selectionPayload = {
        ownerId: ownerUuid,
        corporateRef,
        corporateName,
        storeRef,
        storeName: store?.storeName || 'Store',
      };

      // HARDENING: ensure payload is complete before proceeding
      const isComplete =
        !!selectionPayload.ownerId &&
        !!selectionPayload.corporateRef &&
        !!selectionPayload.storeRef;

      if (!isComplete) {
        Alert.alert('Error', 'Selection is incomplete. Please try again.');
        return;
      }

      console.log('AGPAY SELECTION → saving:', selectionPayload);

      await Keychain.setInternetCredentials(
        'agpaySelection',
        'selection',
        JSON.stringify(selectionPayload),
      );

      console.log('AGPAY SELECTION → saved to Keychain');

      onSelectionCompleted();
    } catch (e) {
      console.log('handlePickStore error:', e);
      Alert.alert('Error', 'Failed to save store selection.');
    } finally {
      setSaving(false);
    }
  }

  function renderItem({item}) {
    return (
      <TouchableOpacity
        style={[styles.card, saving && {opacity: 0.6}]}
        disabled={saving}
        onPress={() => handlePickStore(item)}>
        <Text style={styles.name}>{item.storeName || 'Unnamed Store'}</Text>
        <Text style={styles.sub}>
          {item.storeCode ? `Code: ${item.storeCode}` : '—'} ·{' '}
          {item.city || item?.address?.city || ''}
        </Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading stores…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Select a Store</Text>

        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.logout}>⎋</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.context}>
        Corporate: <Text style={{color: GOLD}}>{corporateName}</Text>
      </Text>

      {filteredStores.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No stores found for this corporate.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadStores}>
            <Text style={styles.retryText}>Reload</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredStores}
          keyExtractor={item =>
            item.corpStoreKey || `${item.storeUuid}#${item.storeEpoch}`
          }
          renderItem={renderItem}
          contentContainerStyle={{paddingBottom: 40}}
        />
      )}
    </View>
  );
}

const GOLD = '#d4af37';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020617',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
  back: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '700',
  },
  logout: {
    fontSize: 22,
    color: GOLD,
  },
  context: {
    color: '#9ca3af',
    marginBottom: 12,
    fontSize: 12,
  },
  card: {
    backgroundColor: '#050814',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  name: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  sub: {
    marginTop: 6,
    color: '#9ca3af',
    fontSize: 12,
  },
  center: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#9ca3af',
  },
  empty: {
    marginTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9ca3af',
    marginBottom: 14,
  },
  retryBtn: {
    backgroundColor: GOLD,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  retryText: {
    color: '#020617',
    fontWeight: '800',
  },
});
