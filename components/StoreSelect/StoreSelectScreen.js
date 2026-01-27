// FILE: components/StoreSelect/StoreSelectScreen.js
import React, {useEffect, useState} from 'react';
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

async function readAgpayAuthToken() {
  try {
    const creds = await Keychain.getInternetCredentials('agpayAuth');
    if (!creds?.password) return null;
    const parsed = JSON.parse(creds.password);
    return parsed?.token || null; // RAW JWT — NO Bearer
  } catch (e) {
    console.log('readAgpayAuthToken error:', e);
    return null;
  }
}

async function readAgpaySelection() {
  try {
    const creds = await Keychain.getInternetCredentials('agpaySelection');
    if (!creds?.password) return null;
    return JSON.parse(creds.password);
  } catch (e) {
    console.log('readAgpaySelection error:', e);
    return null;
  }
}

async function saveAgpaySelection(nextSelection) {
  try {
    await Keychain.setInternetCredentials(
      'agpaySelection',
      'selection',
      JSON.stringify(nextSelection || {}),
    );
    console.log('✅ Saved agpaySelection (store updated)');
  } catch (e) {
    console.log('saveAgpaySelection error:', e);
  }
}

function buildStoreRef(store) {
  const su = store?.storeUuid;
  const se = store?.storeEpoch;
  if (!su || !se) return null;
  return `${su}#${se}`;
}

/**
 * Try to decide whether a store belongs to the selected corporate.
 */
function storeMatchesCorporate(store, sel) {
  if (!store || !sel) return false;

  const selCorporateId = sel?.corporateId ? String(sel.corporateId) : null;
  const selCorporateRef = sel?.corporateRef ? String(sel.corporateRef) : null;

  const candidates = [
    store?.corporateId,
    store?.corporateUuid,
    store?.corpId,
    store?.corporate_id,
    store?.corporate_uuid,
  ]
    .filter(v => v !== undefined && v !== null)
    .map(v => String(v));

  if (selCorporateId && candidates.includes(selCorporateId)) return true;

  const refCandidates = [store?.corporateRef, store?.corporate_ref]
    .filter(v => v !== undefined && v !== null)
    .map(v => String(v));

  if (selCorporateRef && refCandidates.includes(selCorporateRef)) return true;

  const corpStoreKey = store?.corpStoreKey ? String(store.corpStoreKey) : '';
  if (corpStoreKey) {
    if (selCorporateId && corpStoreKey.includes(selCorporateId)) return true;
    if (selCorporateRef && corpStoreKey.includes(selCorporateRef)) return true;
  }

  return false;
}

export default function StoreSelectScreen({
  onStorePicked,
  onBack,
  onLogout,
  themeMode,
  onToggleTheme,
}) {
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState([]);

  useEffect(() => {
    (async () => {
      const sel = await readAgpaySelection();

      if (!sel?.corporateId && !sel?.corporateRef) {
        console.log(
          '❌ Missing corporateId/corporateRef in agpaySelection:',
          sel,
        );
        Alert.alert(
          'Missing corporate',
          'Corporate selection missing corporate info. Please select a corporate again.',
        );
        setLoading(false);
        return;
      }

      await loadStores(sel?.corporateId || sel?.corporateRef, sel);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStores(corporateKey, sel) {
    try {
      setLoading(true);

      const token = await readAgpayAuthToken();
      if (!token) {
        Alert.alert('Auth error', 'Missing token. Please log in again.');
        return;
      }

      const encodedCorporateKey = encodeURIComponent(String(corporateKey));
      const url = `${STORES_URL}?corporateId=${encodedCorporateKey}`;

      console.log('STORES → fetching with JWT (GET by corporateId)');
      console.log('STORES → url:', url);
      console.log('STORES → selection corporateId:', sel?.corporateId);
      console.log('STORES → selection corporateRef:', sel?.corporateRef);

      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
      });

      const text = await resp.text();
      console.log('STORES → HTTP status:', resp.status);

      if (!resp.ok) {
        console.log('STORES → failed:', text);
        Alert.alert('Error', 'Failed to load stores.');
        return;
      }

      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      const arr = Array.isArray(data) ? data : [];
      console.log('STORES → received count:', arr.length);

      const filtered = arr.filter(s => storeMatchesCorporate(s, sel));
      console.log(
        'STORES → filtered count:',
        filtered.length,
        ' (selection corporateId:',
        sel?.corporateId,
        'corporateRef:',
        sel?.corporateRef,
        ')',
      );

      if (filtered.length === 0 && arr.length > 0) {
        console.log(
          '⚠️ STORES → filter found 0 matches. Showing ALL stores so UI is not blocked.',
        );
        setStores(arr);
      } else {
        setStores(filtered);
      }
    } catch (e) {
      console.log('STORES → exception:', e);
      Alert.alert('Error', 'Unable to load stores.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePickStore(store) {
    try {
      console.log('STORE PICKED:', store);

      const storeName = store?.storeName || 'Unnamed Store';
      const storeRef = buildStoreRef(store);

      if (!storeRef) {
        Alert.alert(
          'Invalid store record',
          'Store is missing storeUuid/storeEpoch.',
        );
        return;
      }

      const sel = (await readAgpaySelection()) || {};

      const next = {
        ...sel,

        corporateId: sel.corporateId || null,
        corporateRef: sel.corporateRef || null,
        corporateName: sel.corporateName || null,

        storeName,
        storeRef,
        storeUuid: store?.storeUuid || null,
        storeEpoch: store?.storeEpoch || null,

        corpStoreKey: store?.corpStoreKey || null,
      };

      await saveAgpaySelection(next);

      if (typeof onStorePicked !== 'function') {
        console.log('❌ onStorePicked is not a function:', onStorePicked);
        Alert.alert(
          'Navigation missing',
          'onStorePicked not configured. Check App.js wiring.',
        );
        return;
      }

      onStorePicked(store);
    } catch (e) {
      console.log('handlePickStore error:', e);
      Alert.alert('Error', 'Unable to select store.');
    }
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
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Select a Store</Text>

        <View style={styles.headerRight}>
          <TouchableOpacity onPress={onToggleTheme}>
            <Text style={styles.toggleIcon}>
              {themeMode === 'dark' ? '☀️' : '🌙'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onLogout}>
            <Text style={styles.logout}>⎋</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={stores}
        keyExtractor={(item, idx) =>
          String(item?.corpStoreKey || item?.storeUuid || idx)
        }
        renderItem={({item}) => {
          const name = item?.storeName || 'Unnamed Store';
          const sub = `${item?.status || '—'} · ${item?.country || ''}`.trim();

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => handlePickStore(item)}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.sub}>{sub}</Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{paddingBottom: 40}}
        ListEmptyComponent={
          <View style={{marginTop: 40, alignItems: 'center'}}>
            <Text style={{color: '#9ca3af', marginBottom: 14}}>
              No stores found.
            </Text>
          </View>
        }
      />
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
    marginBottom: 16,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleIcon: {fontSize: 20, color: GOLD},
  title: {
    color: 'white',
    fontSize: 22,
    fontWeight: '800',
  },
  logout: {
    fontSize: 22,
    color: GOLD,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
  },
  backText: {fontSize: 13, color: '#fff', fontWeight: '900'},
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
});
