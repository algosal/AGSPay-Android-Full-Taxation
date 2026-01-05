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

export default function CorporateSelectScreen({onCorporatePicked, onLogout}) {
  const [loading, setLoading] = useState(true);
  const [corporates, setCorporates] = useState([]);

  useEffect(() => {
    loadCorporates();
  }, []);

  async function loadCorporates() {
    try {
      setLoading(true);

      const authCreds = await Keychain.getInternetCredentials('agpayAuth');
      if (!authCreds || !authCreds.password) {
        Alert.alert('Auth error', 'Missing authentication context.');
        return;
      }

      const auth = JSON.parse(authCreds.password);
      const token = auth.token;

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

      const data = JSON.parse(text);
      console.log('CORPORATES → received:', data);

      setCorporates(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('CORPORATES → exception:', e);
      Alert.alert('Error', 'Unable to load corporates.');
    } finally {
      setLoading(false);
    }
  }

  function renderItem({item}) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          console.log('CORPORATE PICKED:', item);
          onCorporatePicked(item);
        }}>
        <Text style={styles.name}>
          {item.corporateName || item.dbaName || 'Unnamed Corporate'}
        </Text>
        <Text style={styles.sub}>
          {item.industry || '—'} · {item.country || ''}
        </Text>
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
        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.logout}>⎋</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={corporates}
        keyExtractor={item => item.corporateId}
        renderItem={renderItem}
        contentContainerStyle={{paddingBottom: 40}}
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
});
