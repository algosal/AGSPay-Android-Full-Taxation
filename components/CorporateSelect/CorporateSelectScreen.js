// FILE: components/CorporateSelect/CorporateSelectScreen.js
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

const CORPORATES_URL =
  'https://kvscjsddkd.execute-api.us-east-2.amazonaws.com/prod/VendioCorporates';

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

async function saveAgpaySelection(selectionPayload) {
  try {
    await Keychain.setInternetCredentials(
      'agpaySelection',
      'selection',
      JSON.stringify(selectionPayload || {}),
    );
    console.log('✅ Saved agpaySelection');
  } catch (e) {
    console.log('saveAgpaySelection error:', e);
  }
}

export default function CorporateSelectScreen({
  onCorporatePicked,
  onLogout,
  themeMode,
  onToggleTheme,
}) {
  const [loading, setLoading] = useState(true);
  const [corporates, setCorporates] = useState([]);

  useEffect(() => {
    loadCorporates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCorporates() {
    try {
      setLoading(true);

      const token = await readAgpayAuthToken();
      if (!token) {
        Alert.alert('Auth error', 'Missing token. Please log in again.');
        return;
      }

      console.log('CORPORATES → fetching with JWT');

      const resp = await fetch(CORPORATES_URL, {
        method: 'GET',
        headers: {
          Authorization: token, // RAW JWT — NO Bearer
          'Content-Type': 'application/json',
        },
      });

      const text = await resp.text();

      if (!resp.ok) {
        console.log('CORPORATES → error response:', text);
        Alert.alert('Error', 'Failed to load corporates.');
        return;
      }

      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      console.log('CORPORATES → received:', data);

      setCorporates(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('CORPORATES → exception:', e);
      Alert.alert('Error', 'Unable to load corporates.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePickCorporate(corp) {
    try {
      if (!corp?.corporateId) {
        Alert.alert('Select corporate', 'Invalid corporate record.');
        return;
      }

      console.log('CORPORATE PICKED:', corp);

      const corporateId = corp.corporateId; // "CORP#<uuid>#<epoch>"

      const corporateRef = String(corporateId || '').startsWith('CORP#')
        ? String(corporateId).replace(/^CORP#/, '')
        : corp.corporateRef;

      if (!corporateRef || !String(corporateRef).includes('#')) {
        console.log('❌ Invalid corporateRef derived:', corporateRef);
        Alert.alert(
          'Corporate error',
          'Could not derive corporateRef (uuid#epoch).',
        );
        return;
      }

      const payload = {
        ownerId: corp.ownerId || null,
        corporateId,
        corporateRef,
        corporateName: corp.corporateName || corp.dbaName || '',
        corporateUuid: corp.corporateUuid || null,

        storeName: null,
        storeRef: null,
        storeUuid: null,
        storeEpoch: null,
        corpStoreKey: null,
      };

      await saveAgpaySelection(payload);
      console.log('✅ Cleared store fields in agpaySelection');

      if (typeof onCorporatePicked !== 'function') {
        console.log(
          '❌ onCorporatePicked is not a function:',
          onCorporatePicked,
        );
        Alert.alert(
          'Navigation missing',
          'onCorporatePicked not configured. Check App.js wiring.',
        );
        return;
      }

      onCorporatePicked(corp);
    } catch (e) {
      console.log('handlePickCorporate error:', e);
      Alert.alert('Error', 'Unable to select corporate.');
    }
  }

  function renderItem({item}) {
    const name = item?.corporateName || item?.dbaName || 'Unnamed Corporate';
    const sub = `${item?.industry || '—'} · ${item?.country || ''}`.trim();

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handlePickCorporate(item)}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading corporates…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Select a Corporate</Text>

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
        data={corporates}
        keyExtractor={(item, idx) => item?.corporateId || String(idx)}
        renderItem={renderItem}
        contentContainerStyle={{paddingBottom: 40}}
        ListEmptyComponent={
          <View style={{marginTop: 40, alignItems: 'center'}}>
            <Text style={{color: '#9ca3af', marginBottom: 14}}>
              No corporates found.
            </Text>
            <TouchableOpacity style={styles.reloadBtn} onPress={loadCorporates}>
              <Text style={styles.reloadText}>Reload</Text>
            </TouchableOpacity>
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
  reloadBtn: {
    backgroundColor: GOLD,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  reloadText: {
    color: '#020617',
    fontWeight: '800',
  },
});
// FILE: components/Terminal/AmountEntryScreen.jsx
