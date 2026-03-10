// FILE: components/Sales/TodayTransactionsScreen.js

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import * as Keychain from 'react-native-keychain';

const TXN_URL =
  'https://kvscjsddkd.execute-api.us-east-2.amazonaws.com/prod/VendioTransactions';

async function readAgpayAuthToken() {
  try {
    const tokenCreds = await Keychain.getGenericPassword({
      service: 'agpayAuthToken',
    });
    if (tokenCreds?.password && typeof tokenCreds.password === 'string') {
      return tokenCreds.password;
    }

    const creds = await Keychain.getInternetCredentials('agpayAuth');
    if (!creds?.password) return null;
    const parsed = JSON.parse(creds.password);
    return parsed?.token || null;
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

function safeJsonParse(x) {
  try {
    return JSON.parse(String(x || '').trim());
  } catch {
    return null;
  }
}

function getEpochMs(t) {
  const n = Number(t?.serverEpochMs ?? t?.clientEpochMs ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function centsToUsd(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${(n / 100).toFixed(2)}`;
}

function isPayoutEventRow(t) {
  return String(t?.debugMeta?.rowType || '').trim() === 'PAYOUT_EVENT';
}

function getTxnAmountCents(t) {
  return Number(t?.totalCents ?? t?.stripe?.amount ?? 0) || 0;
}

function getSubtotalCents(t) {
  return Number(t?.subtotalCents ?? t?.debugMeta?.subtotalCents ?? 0) || 0;
}

function getCardCountry(t) {
  return String(
    t?.cardCountry ||
      t?.debugMeta?.cardCountry ||
      t?.stripe?.payment_method_details?.card_present?.country ||
      t?.stripe?.payment_method_details?.cardPresent?.country ||
      t?.stripe?.charges?.data?.[0]?.payment_method_details?.card_present
        ?.country ||
      t?.stripe?.charges?.data?.[0]?.payment_method_details?.cardPresent
        ?.country ||
      t?.stripe?.charges?.[0]?.paymentMethodDetails?.cardPresentDetails
        ?.country ||
      t?.stripe?.charges?.[0]?.payment_method_details?.card_present?.country ||
      '',
  ).trim();
}

function getReceiptUrl(t) {
  return String(
    t?.receiptUrl ||
      t?.receipt_url ||
      t?.emailReceiptUrl ||
      t?.email_receipt_url ||
      t?.stripe?.receipt_url ||
      t?.stripe?.charges?.data?.[0]?.receipt_url ||
      t?.stripe?.charges?.[0]?.receipt_url ||
      '',
  ).trim();
}

function isToday(epochMs) {
  if (!epochMs) return false;

  const d = new Date(epochMs);
  const now = new Date();

  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatTime(epochMs) {
  if (!epochMs) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(epochMs));
}

function isValidStorePrefix(value) {
  const s = String(value || '').trim();
  if (!s.startsWith('CORP#')) return false;
  if (!s.includes('#STORE#')) return false;

  const afterStore = s.split('#STORE#')[1] || '';
  if (afterStore.trim().startsWith('CORP#')) return false;

  return true;
}

function extractStoreName(selection) {
  return String(
    selection?.storeName ||
      selection?.selectedStore?.storeName ||
      selection?.store?.storeName ||
      'Store',
  ).trim();
}

function extractStorePrefix(selection) {
  if (!selection || typeof selection !== 'object') return '';

  const candidates = [
    selection?.corpStoreKey,
    selection?.storePrefix,
    selection?.store_prefix,
    selection?.storeKey,
    selection?.store_key,
    selection?.storePk,
    selection?.storePK,
    selection?.sk,
    selection?.selectedStore?.corpStoreKey,
    selection?.selectedStore?.storePrefix,
    selection?.selectedStore?.store_key,
    selection?.selectedStore?.storeKey,
    selection?.store?.corpStoreKey,
    selection?.store?.storePrefix,
    selection?.store?.store_key,
    selection?.store?.storeKey,
    selection?.storeRef,
  ];

  for (const c of candidates) {
    const s = String(c || '').trim();
    if (isValidStorePrefix(s)) {
      return s;
    }
  }

  return '';
}

export default function TodayTransactionsScreen({onBack, theme}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');
  const [storeName, setStoreName] = useState('Store');

  const [selectedTxn, setSelectedTxn] = useState(null);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState('');

  const t = useMemo(() => {
    return {
      bg: theme?.bg ?? '#020617',
      card: theme?.card ?? '#050814',
      inputBg: theme?.inputBg ?? '#0b1222',
      text: theme?.text ?? '#ffffff',
      muted: theme?.muted ?? '#9ca3af',
      border: theme?.border ?? '#1f2937',
      gold: theme?.gold ?? '#d4af37',
      danger: theme?.danger ?? '#ef4444',
    };
  }, [theme]);

  const loadTransactions = useCallback(async (pull = false) => {
    try {
      if (pull) setRefreshing(true);
      else setLoading(true);

      setErr('');

      const token = await readAgpayAuthToken();
      if (!token) {
        throw new Error('Missing JWT token. Please log in again.');
      }

      const selection = await readAgpaySelection();
      console.log('TodayTransactionsScreen selection:', selection);

      const currentStoreName = extractStoreName(selection);
      setStoreName(currentStoreName || 'Store');

      const storePrefix = extractStorePrefix(selection);
      console.log('TodayTransactionsScreen storePrefix:', storePrefix);

      if (!storePrefix) {
        throw new Error('Missing valid full storePrefix in agpaySelection.');
      }

      const url = `${TXN_URL}?storePrefix=${encodeURIComponent(storePrefix)}`;
      console.log('TodayTransactionsScreen GET:', url);

      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
      });

      const text = await resp.text();
      console.log('TodayTransactionsScreen HTTP:', resp.status, text);

      if (!resp.ok) {
        throw new Error(
          `Failed to load transactions: HTTP ${resp.status}. Body: ${text}`,
        );
      }

      let outer = safeJsonParse(text);
      if (!outer) {
        throw new Error('Transactions API returned non-JSON response.');
      }

      let data = outer;

      if (Array.isArray(outer)) {
        data = outer;
      } else if (typeof outer?.body === 'string') {
        const inner = safeJsonParse(outer.body);
        data = inner || [];
      } else if (outer?.body && Array.isArray(outer.body)) {
        data = outer.body;
      }

      const arr = Array.isArray(data) ? data : [];
      console.log('TodayTransactionsScreen parsed rows:', arr.length);

      const filtered = arr
        .filter(txn => !isPayoutEventRow(txn))
        .filter(txn => isToday(getEpochMs(txn)))
        .sort((a, b) => getEpochMs(b) - getEpochMs(a));

      console.log('TodayTransactionsScreen today rows:', filtered.length);

      setRows(filtered);
    } catch (e) {
      console.log('TodayTransactionsScreen load error:', e);
      setErr(String(e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTransactions(false);
  }, [loadTransactions]);

  const totalTodayCents = useMemo(() => {
    return rows.reduce((sum, txn) => sum + getTxnAmountCents(txn), 0);
  }, [rows]);

  const openEmailModal = txn => {
    setSelectedTxn(txn);
    setReceiptEmail('');
    setEmailModalVisible(true);
  };

  const handleEmailReceipt = async () => {
    try {
      if (!selectedTxn) {
        Alert.alert('Receipt', 'No transaction selected.');
        return;
      }

      const to = String(receiptEmail || '').trim();
      if (!to) {
        Alert.alert('Email receipt', 'Please enter an email address.');
        return;
      }

      const receiptUrl = getReceiptUrl(selectedTxn);
      if (!receiptUrl) {
        Alert.alert('Receipt', 'No receipt link found for this transaction.');
        return;
      }

      const subject = encodeURIComponent('Your AGPay Receipt');
      const body = encodeURIComponent(`Here is your receipt:\n\n${receiptUrl}`);

      const mailto = `mailto:${encodeURIComponent(
        to,
      )}?subject=${subject}&body=${body}`;
      const supported = await Linking.canOpenURL(mailto);

      if (!supported) {
        Alert.alert(
          'Email receipt',
          'No mail app is available on this device.',
        );
        return;
      }

      await Linking.openURL(mailto);
      setEmailModalVisible(false);
    } catch (e) {
      console.log('handleEmailReceipt error:', e);
      Alert.alert('Email receipt', 'Failed to open email composer.');
    }
  };

  const renderRow = ({item}) => {
    const epoch = getEpochMs(item);
    const totalAmount = getTxnAmountCents(item);
    const subtotal = getSubtotalCents(item);
    const country = getCardCountry(item);

    return (
      <View
        style={{
          backgroundColor: t.inputBg,
          borderColor: t.border,
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 14,
          marginBottom: 10,
        }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}>
          <View style={{flex: 1, paddingRight: 10}}>
            <Text
              style={{
                color: t.text,
                fontSize: 18,
                fontWeight: '800',
              }}>
              {formatTime(epoch)}
            </Text>

            <Text
              style={{
                color: t.muted,
                fontSize: 13,
                marginTop: 4,
                fontWeight: '700',
              }}>
              Subtotal: {centsToUsd(subtotal)}
            </Text>

            <Text
              style={{
                color: t.muted,
                fontSize: 13,
                marginTop: 2,
                fontWeight: '700',
              }}>
              Country: {country || '-'}
            </Text>

            <Text
              style={{
                color: t.muted,
                fontSize: 13,
                marginTop: 2,
                fontWeight: '700',
              }}>
              Payment Successful
            </Text>
          </View>

          <Pressable
            onPress={() => openEmailModal(item)}
            style={{
              alignItems: 'flex-end',
            }}>
            <Text
              style={{
                color: t.gold,
                fontSize: 20,
                fontWeight: '900',
              }}>
              {centsToUsd(totalAmount)}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={{flex: 1, backgroundColor: t.bg, padding: 16}}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}>
        <Pressable
          onPress={() => onBack?.()}
          style={{
            backgroundColor: t.inputBg,
            borderColor: t.border,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}>
          <Text style={{color: t.text, fontWeight: '800'}}>Back</Text>
        </Pressable>

        <Pressable
          onPress={() => loadTransactions(false)}
          style={{
            backgroundColor: t.inputBg,
            borderColor: t.border,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}>
          <Text style={{color: t.gold, fontWeight: '800', fontSize: 18}}>
            🔄
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          flex: 1,
          backgroundColor: t.card,
          borderColor: t.border,
          borderWidth: 1,
          borderRadius: 16,
          padding: 16,
        }}>
        <Text
          style={{
            color: t.text,
            fontSize: 24,
            fontWeight: '900',
          }}>
          Transactions
        </Text>

        <Text
          style={{
            color: t.muted,
            fontSize: 14,
            marginTop: 4,
          }}>
          {storeName}
        </Text>

        <Text
          style={{
            color: t.gold,
            fontSize: 16,
            fontWeight: '800',
            marginTop: 10,
            marginBottom: 14,
          }}>
          Total Today: {centsToUsd(totalTodayCents)}
        </Text>

        {loading ? (
          <View
            style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
            <ActivityIndicator size="large" color={t.gold} />
            <Text style={{color: t.muted, marginTop: 10}}>Loading…</Text>
          </View>
        ) : err ? (
          <View style={{flex: 1, justifyContent: 'center'}}>
            <Text
              style={{
                color: t.danger,
                fontSize: 15,
                fontWeight: '700',
                textAlign: 'center',
              }}>
              {err}
            </Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={{flex: 1, justifyContent: 'center'}}>
            <Text
              style={{
                color: t.muted,
                textAlign: 'center',
                fontSize: 15,
              }}>
              No transactions found for today.
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item, index) =>
              String(
                item?.txnKey || item?.txuuid || `${getEpochMs(item)}-${index}`,
              )
            }
            renderItem={renderRow}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadTransactions(true)}
                tintColor={t.gold}
              />
            }
          />
        )}
      </View>

      <Modal
        visible={emailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailModalVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            padding: 20,
          }}>
          <View
            style={{
              backgroundColor: t.card,
              borderColor: t.border,
              borderWidth: 1,
              borderRadius: 18,
              padding: 18,
            }}>
            <Text
              style={{
                color: t.text,
                fontSize: 20,
                fontWeight: '900',
                marginBottom: 12,
              }}>
              Email Receipt
            </Text>

            <Text style={{color: t.muted, fontWeight: '700', marginBottom: 6}}>
              Amount
            </Text>
            <Text style={{color: t.gold, fontWeight: '900', fontSize: 18}}>
              {selectedTxn
                ? centsToUsd(getTxnAmountCents(selectedTxn))
                : '$0.00'}
            </Text>

            <Text
              style={{
                color: t.muted,
                fontWeight: '700',
                marginTop: 12,
                marginBottom: 6,
              }}>
              Subtotal
            </Text>
            <Text style={{color: t.text, fontWeight: '800'}}>
              {selectedTxn
                ? centsToUsd(getSubtotalCents(selectedTxn))
                : '$0.00'}
            </Text>

            <Text
              style={{
                color: t.muted,
                fontWeight: '700',
                marginTop: 12,
                marginBottom: 6,
              }}>
              Country
            </Text>
            <Text style={{color: t.text, fontWeight: '800'}}>
              {selectedTxn ? getCardCountry(selectedTxn) || '-' : '-'}
            </Text>

            <Text
              style={{
                color: t.muted,
                fontWeight: '700',
                marginTop: 12,
                marginBottom: 6,
              }}>
              Status
            </Text>
            <Text style={{color: t.text, fontWeight: '800'}}>
              Payment Successful
            </Text>

            <Text
              style={{
                color: t.muted,
                fontWeight: '700',
                marginTop: 12,
                marginBottom: 6,
              }}>
              Email
            </Text>

            <TextInput
              value={receiptEmail}
              onChangeText={setReceiptEmail}
              placeholder="customer@email.com"
              placeholderTextColor={t.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                color: t.text,
                backgroundColor: t.inputBg,
                borderColor: t.border,
                borderWidth: 1,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
              }}
            />

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 16,
                gap: 10,
              }}>
              <Pressable
                onPress={() => setEmailModalVisible(false)}
                style={{
                  flex: 1,
                  backgroundColor: t.inputBg,
                  borderColor: t.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}>
                <Text style={{color: t.text, fontWeight: '800'}}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleEmailReceipt}
                style={{
                  flex: 1,
                  backgroundColor: t.gold,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}>
                <Text style={{color: '#020617', fontWeight: '900'}}>
                  Email Receipt
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
