// FILE: components/Sales/StoreSalesScreen.js
//
// Android Store Sales screen (same vibe as Terminal screens)
// ✅ Keeps existing Sales fetch
// ✅ Adds "Email Report" button that calls your backend:
//    POST https://agspay.us/email/store_sales.php
//    Header: X-AGPAY-KEY
//
// Recipients logic (frontend):
// - Owner email (from Keychain session)
// - Store contact email (from agpaySelection store object, if present)
// - Admin email: agspay@yahoo.com
// Backend will also send the separate DARK test copy to pfc.salman@gmail.com (per your PHP)

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Keychain from 'react-native-keychain';
import {pressFX, androidRipple} from '../ui/pressFX';

const SALES_URL =
  'https://kvscjsddkd.execute-api.us-east-2.amazonaws.com/prod/todays-sales';

// ✅ Store sales email endpoint
const EMAIL_SALES_URL = 'https://agspay.us/email/store_sales.php';

// ✅ TEMP key (move to env later)
const AGPAY_EMAIL_KEY = 'TEST_SECRET_123';

// ✅ Always include admin
const ADMIN_EMAIL = 'agspay@yahoo.com';

// ---------------------- helpers ----------------------
function safeJsonParse(x) {
  try {
    return JSON.parse(String(x || '').trim());
  } catch {
    return null;
  }
}

function centsToMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function isValidEmail(email) {
  const e = String(email || '').trim();
  if (!e) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// America/New_York date in YYYY-MM-DD (for backend query param)
function nycDateYYYYMMDD(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);

    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch {}

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// America/New_York long date label: "February 9th, 2026"
function formatNYCDateLong(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).formatToParts(d);

    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const year = parts.find(p => p.type === 'year')?.value;

    const dayNum = Number(day);
    if (month && dayNum && year) return `${month} ${ordinal(dayNum)}, ${year}`;
  } catch {}

  const month = d.toLocaleString('en-US', {month: 'long'});
  return `${month} ${ordinal(d.getDate())}, ${d.getFullYear()}`;
}

async function readAgpaySelection() {
  try {
    const creds = await Keychain.getInternetCredentials('agpaySelection');
    if (!creds?.password) return null;
    return JSON.parse(creds.password);
  } catch (e) {
    console.log('StoreSalesScreen readAgpaySelection error:', e);
    return null;
  }
}

async function readAgpayAuthToken() {
  try {
    const tokenCreds = await Keychain.getGenericPassword({
      service: 'agpayAuthToken',
    });
    if (tokenCreds?.password && typeof tokenCreds.password === 'string') {
      return tokenCreds.password;
    }

    const internet = await Keychain.getInternetCredentials('agpayAuth');
    if (internet?.password) {
      const parsed = safeJsonParse(internet.password);
      if (parsed?.token) return parsed.token;
    }
    return null;
  } catch (e) {
    console.log('readAgpayAuthToken error:', e);
    return null;
  }
}

// ✅ Logged-in owner email (Keychain) – tries common saved session shapes
async function readLoggedInEmailFromKeychain() {
  const servicesToTry = ['agpaySession', 'agpayAuth'];

  for (const svc of servicesToTry) {
    try {
      const creds = await Keychain.getInternetCredentials(svc);
      const raw = creds?.password ? String(creds.password).trim() : '';
      if (!raw) continue;

      const obj = safeJsonParse(raw);
      if (!obj || typeof obj !== 'object') continue;

      const e1 = obj.email;
      const e2 = obj.profile?.email;
      const e3 = obj.session?.email;

      const email = String(e1 || e2 || e3 || '').trim();
      if (email && isValidEmail(email)) return email;
    } catch {}
  }

  return '';
}

// Normalize common backend shapes:
// - {statusCode, body:"{...}"}
// - {body:{...}}
// - direct object
function unwrapApiGatewayJson(rawText) {
  const outer = safeJsonParse(rawText);
  if (!outer) return null;

  if (outer && typeof outer.body === 'string') {
    const inner = safeJsonParse(outer.body);
    return inner || outer;
  }
  if (outer && typeof outer.body === 'object') {
    return outer.body;
  }
  return outer;
}

// ---------------------- component ----------------------
export default function StoreSalesScreen({theme, onBack}) {
  const [sel, setSel] = useState(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);

  // ✅ For email button label/validation
  const [ownerEmail, setOwnerEmail] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  const today = useMemo(() => nycDateYYYYMMDD(new Date()), []);
  const todayLabel = useMemo(() => formatNYCDateLong(new Date()), []);

  const t = useMemo(() => {
    const bg = theme?.bg ?? '#020617';
    const card = theme?.card ?? '#050814';
    const inputBg = theme?.inputBg ?? '#0b1222';
    const text = theme?.text ?? '#ffffff';
    const muted = theme?.muted ?? '#9ca3af';
    const border = theme?.border ?? '#1f2937';
    const gold = theme?.gold ?? '#d4af37';
    const goldText = theme?.goldText ?? '#020617';
    const danger = theme?.danger ?? '#ef4444';
    return {bg, card, inputBg, text, muted, border, gold, goldText, danger};
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await readAgpaySelection();
      if (mounted) setSel(s || null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const em = await readLoggedInEmailFromKeychain();
      const clean = String(em || '').trim();
      console.log('📧 StoreSalesScreen ownerEmail from Keychain:', clean);
      if (mounted) setOwnerEmail(clean);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // ✅ Store name only (no corporation)
  const subtitle = useMemo(() => {
    const st = sel?.storeName ? String(sel.storeName) : 'Store';
    return st;
  }, [sel]);

  const corporateRef = useMemo(
    () => String(sel?.corporateRef || '').trim(),
    [sel],
  );
  const storeRef = useMemo(() => String(sel?.storeRef || '').trim(), [sel]);

  // ✅ Store contact email (from selection store object)
  const storeContactEmail = useMemo(() => {
    const e =
      sel?.email || // your logs show `email` on store object
      sel?.storeEmail ||
      sel?.store_contact_email ||
      sel?.contactEmail ||
      '';
    return String(e || '').trim();
  }, [sel]);

  const fetchSales = useCallback(async () => {
    setErr('');
    setLoading(true);
    setData(null);

    try {
      const jwt = await readAgpayAuthToken();
      if (!jwt) throw new Error('Missing JWT. Please login again.');

      if (!corporateRef)
        throw new Error('Missing corporateRef in Keychain (agpaySelection).');
      if (!storeRef)
        throw new Error('Missing storeRef in Keychain (agpaySelection).');

      const url =
        `${SALES_URL}` +
        `?corporateRef=${encodeURIComponent(corporateRef)}` +
        `&storeRef=${encodeURIComponent(storeRef)}` +
        `&date=${encodeURIComponent(today)}`;

      console.log('📊 SALES → GET:', url);

      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: jwt, // ✅ raw token, no Bearer
        },
      });

      const text = await resp.text();
      console.log('📊 SALES → HTTP:', resp.status, text);

      if (!resp.ok) {
        throw new Error(
          `Sales fetch failed: HTTP ${resp.status}. Body: ${text}`,
        );
      }

      const parsed = unwrapApiGatewayJson(text);
      if (!parsed) throw new Error(`Sales returned non-JSON. Body: ${text}`);

      setData(parsed);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [corporateRef, storeRef, today]);

  useEffect(() => {
    if (corporateRef && storeRef) fetchSales();
  }, [corporateRef, storeRef, fetchSales]);

  // Totals are returned under data.totals
  const totals = useMemo(() => {
    const d = data && typeof data === 'object' ? data : {};
    const tot = d.totals && typeof d.totals === 'object' ? d.totals : {};

    const txns =
      d.txns ||
      d.transactions ||
      d.items ||
      d.records ||
      (d.data && (d.data.txns || d.data.transactions)) ||
      [];
    const list = Array.isArray(txns) ? txns : [];

    return {
      count: Number(tot.count ?? list.length ?? 0),
      subtotalCents: Number(tot.subtotalCents ?? 0),
      taxCents: Number(tot.taxCents ?? 0),
      tipCents: Number(tot.tipCents ?? 0),
      serviceFeeCents: Number(tot.serviceFeeCents ?? 0),
      totalCents: Number(tot.totalCents ?? 0),
      payoutAmountCents: Number(tot.payoutAmountCents ?? 0),
      list,
    };
  }, [data]);

  const handleEmailReport = useCallback(async () => {
    try {
      if (emailSending) return;

      // refresh owner on demand (so it stays accurate)
      const em = (await readLoggedInEmailFromKeychain()) || ownerEmail || '';
      const owner = String(em || '').trim();
      const storeEmail = String(storeContactEmail || '').trim();

      const recipientsRaw = [owner, storeEmail, ADMIN_EMAIL]
        .map(x => String(x || '').trim())
        .filter(Boolean);

      // validate + dedupe (keep stable)
      const recipients = Array.from(
        new Set(recipientsRaw.filter(isValidEmail).map(x => x.toLowerCase())),
      );

      console.log('📧 Email button pressed → recipients:', recipients);

      if (!recipients.length) {
        Alert.alert(
          'Email not available',
          'We couldn’t find a valid owner / store email on this device.\n\nPlease log in again and try once more.',
        );
        return;
      }

      // Backend requires `to` (owner) + optional storeEmail
      const payload = {
        to: recipients[0], // primary
        storeEmail: storeEmail, // backend will include if different + valid
        storeName: subtitle || 'Store',
        dateLabel: todayLabel,
        timezone: 'America/New_York',
        totals: {
          count: totals.count,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          tipCents: totals.tipCents,
          serviceFeeCents: totals.serviceFeeCents,
          totalCents: totals.totalCents,
          payoutAmountCents: totals.payoutAmountCents,
        },
      };

      console.log('📧 SALES EMAIL payload:', JSON.stringify(payload));

      setEmailSending(true);

      const resp = await fetch(EMAIL_SALES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AGPAY-KEY': AGPAY_EMAIL_KEY,
        },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      console.log('📧 SALES EMAIL HTTP:', resp.status, text);

      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`);

      // Humble confirmation (clear + premium)
      Alert.alert(
        'Report sent',
        `We emailed today’s sales summary to:\n\n• Owner\n• Store contact\n• AGSPay admin\n\n(And a developer test copy was delivered.)`,
      );
    } catch (e) {
      console.log('EMAIL SALES error:', e);
      Alert.alert(
        'Email failed',
        'We couldn’t send the report right now.\n\nPlease try again in a moment.',
      );
    } finally {
      setEmailSending(false);
    }
  }, [
    emailSending,
    ownerEmail,
    storeContactEmail,
    subtitle,
    todayLabel,
    totals,
  ]);

  return (
    <View style={[styles.root, {backgroundColor: t.bg}]}>
      <View
        style={[styles.card, {backgroundColor: t.card, borderColor: t.border}]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={onBack}
            {...androidRipple('rgba(250,204,21,0.12)')}
            style={({pressed}) => [
              styles.backBtn,
              {borderColor: t.border, backgroundColor: t.inputBg},
              pressFX({pressed}),
            ]}>
            <Text style={[styles.backText, {color: t.text}]}>Back</Text>
          </Pressable>

          <View style={{flex: 1, alignItems: 'center'}}>
            <Text style={[styles.title, {color: t.text}]}>Store Sales</Text>
            <Text
              style={[
                styles.subtitle,
                {color: t.gold, fontWeight: '900', marginTop: 4},
              ]}>
              {subtitle} Location
            </Text>
            <Text
              style={[
                styles.subtitle,
                {color: t.gold, fontWeight: '900', marginTop: 6},
              ]}>
              {todayLabel}
            </Text>
          </View>

          <Pressable
            onPress={fetchSales}
            disabled={loading}
            {...androidRipple('rgba(250,204,21,0.12)')}
            style={({pressed}) => [
              styles.refreshBtn,
              {
                borderColor: t.border,
                backgroundColor: t.inputBg,
                opacity: loading ? 0.6 : 1,
              },
              pressFX({pressed}),
            ]}>
            <Text style={[styles.refreshText, {color: t.text}]}>
              {loading ? '...' : 'Refresh'}
            </Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.panel,
            {backgroundColor: t.inputBg, borderColor: t.border},
          ]}>
          {!corporateRef || !storeRef ? (
            <Text style={[styles.body, {color: t.danger}]}>
              Missing selection.
              {'\n'}Need corporateRef + storeRef saved in Keychain service
              "agpaySelection".
            </Text>
          ) : null}

          {loading ? (
            <View style={{paddingVertical: 18, alignItems: 'center'}}>
              <ActivityIndicator />
              <Text style={[styles.body, {color: t.muted, marginTop: 10}]}>
                Loading sales…
              </Text>
            </View>
          ) : null}

          {err ? (
            <>
              <Text style={[styles.comingSoon, {color: t.danger}]}>Error</Text>
              <Text style={[styles.body, {color: t.muted}]}>{err}</Text>
            </>
          ) : null}

          {!loading && !err ? (
            <>
              <Text style={[styles.bigNumber, {color: t.gold}]}>
                {centsToMoney(totals.totalCents)}
              </Text>
              <Text
                style={[styles.body, {color: t.muted, textAlign: 'center'}]}>
                Transactions: {totals.count}
              </Text>

              <View style={[styles.divider, {backgroundColor: t.border}]} />

              <View style={styles.grid}>
                <View style={[styles.kv, {borderColor: t.border}]}>
                  <Text style={[styles.k, {color: t.muted}]}>Subtotal</Text>
                  <Text style={[styles.v, {color: t.text}]}>
                    {centsToMoney(totals.subtotalCents)}
                  </Text>
                </View>

                <View style={[styles.kv, {borderColor: t.border}]}>
                  <Text style={[styles.k, {color: t.muted}]}>Tax</Text>
                  <Text style={[styles.v, {color: t.text}]}>
                    {centsToMoney(totals.taxCents)}
                  </Text>
                </View>

                <View style={[styles.kv, {borderColor: t.border}]}>
                  <Text style={[styles.k, {color: t.muted}]}>Tip</Text>
                  <Text style={[styles.v, {color: t.text}]}>
                    {centsToMoney(totals.tipCents)}
                  </Text>
                </View>

                <View style={[styles.kv, {borderColor: t.border}]}>
                  <Text style={[styles.k, {color: t.muted}]}>Service Fee</Text>
                  <Text style={[styles.v, {color: t.text}]}>
                    {centsToMoney(totals.serviceFeeCents)}
                  </Text>
                </View>

                <View style={[styles.kvFull, {borderColor: t.border}]}>
                  <Text style={[styles.k, {color: t.muted}]}>
                    Payout Expected
                  </Text>
                  <Text style={[styles.v, {color: t.text}]}>
                    {centsToMoney(totals.payoutAmountCents)}
                  </Text>
                </View>
              </View>

              {totals.list.length > 0 ? (
                <>
                  <View style={[styles.divider, {backgroundColor: t.border}]} />
                  <Text style={[styles.comingSoon, {color: t.text}]}>
                    Transactions
                  </Text>
                  <ScrollView style={{maxHeight: 260, marginTop: 10}}>
                    {totals.list.map((x, idx) => {
                      const amt = centsToMoney(
                        x?.totalCents ?? x?.debugMeta?.totalCents ?? 0,
                      );
                      const time =
                        x?.created_at ||
                        x?.createdAt ||
                        x?.serverTime ||
                        x?.serverEpochMs ||
                        '';
                      const id =
                        x?.txuuid ||
                        x?.txnKey ||
                        x?.paymentIntentId ||
                        x?.stripe?.paymentIntentId ||
                        `#${idx + 1}`;

                      return (
                        <View
                          key={`${id}-${idx}`}
                          style={[styles.txnRow, {borderColor: t.border}]}>
                          <Text style={[styles.txnAmt, {color: t.text}]}>
                            {amt}
                          </Text>
                          <Text style={[styles.txnMeta, {color: t.muted}]}>
                            {String(id).slice(0, 42)}
                          </Text>
                          {time ? (
                            <Text style={[styles.txnMeta, {color: t.muted}]}>
                              {String(time)}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}
            </>
          ) : null}
        </View>

        {/* ✅ EMAIL BUTTON (Terminal-style gold) */}
        <Pressable
          onPress={handleEmailReport}
          disabled={emailSending}
          {...androidRipple('rgba(0,0,0,0.12)')}
          style={({pressed}) => [
            styles.primaryBtn,
            {backgroundColor: t.gold, opacity: emailSending ? 0.7 : 1},
            pressFX({pressed}),
          ]}>
          <Text style={[styles.primaryText, {color: '#020617'}]}>
            {emailSending ? 'Sending…' : 'Email Store Sales'}
          </Text>
        </Pressable>

        <Text style={[styles.note, {color: t.muted}]}>
          Reports go to owner, store contact, and AGSPay admin.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, padding: 16, justifyContent: 'center'},
  card: {borderRadius: 22, padding: 18, borderWidth: 1},

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {fontSize: 20, fontWeight: '900'},
  subtitle: {marginTop: 4, fontSize: 12, fontWeight: '800'},

  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  backText: {fontSize: 13, fontWeight: '900'},

  refreshBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 72,
    alignItems: 'center',
  },
  refreshText: {fontSize: 13, fontWeight: '900'},

  panel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },

  bigNumber: {fontSize: 34, fontWeight: '900', textAlign: 'center'},
  comingSoon: {fontSize: 18, fontWeight: '900', textAlign: 'center'},
  body: {marginTop: 12, fontSize: 13, fontWeight: '700', lineHeight: 18},

  divider: {height: 1, marginVertical: 14, opacity: 0.8},

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  kv: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  kvFull: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  k: {fontSize: 12, fontWeight: '900'},
  v: {marginTop: 6, fontSize: 16, fontWeight: '900'},

  txnRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  txnAmt: {fontSize: 16, fontWeight: '900'},
  txnMeta: {marginTop: 4, fontSize: 12, fontWeight: '800'},

  primaryBtn: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  primaryText: {fontSize: 16, fontWeight: '900'},

  note: {marginTop: 10, fontSize: 12, fontWeight: '700', textAlign: 'center'},
});
