import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import * as Keychain from 'react-native-keychain';

// -----------------------------------------------------------------------------
// LOGIN API (Vendio Admin MVP)
// -----------------------------------------------------------------------------
const LOGIN_URL =
  'https://qbww95j856.execute-api.us-east-2.amazonaws.com/s1/login';

// If your backend wraps responses like { body: "..." }, this will normalize it.
function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (e) {
    return null;
  }
}

function normalizeLoginResponse(raw) {
  if (!raw) return null;

  // If API Gateway returns { body: "stringified json" }
  if (typeof raw.body === 'string') {
    const inner = safeJsonParse(raw.body);
    return inner || raw;
  }

  // If API Gateway returns { body: { ... } }
  if (raw.body && typeof raw.body === 'object') {
    return raw.body;
  }

  return raw;
}

function resolveToken(payload) {
  if (!payload) return null;
  return (
    payload.token ||
    payload.jwt ||
    payload.access_token ||
    payload.accessToken ||
    payload.idToken ||
    null
  );
}

function resolveOwnerId(payload) {
  if (!payload) return null;

  // 1) Top-level (if backend ever adds it later)
  const direct =
    payload.ownerId ||
    payload.ownerID ||
    payload.userId ||
    payload.userID ||
    payload.sub ||
    null;

  if (direct) return direct;

  // 2) Nested profile object (your current response)
  if (payload.profile && typeof payload.profile === 'object') {
    return payload.profile.userId || payload.profile.userID || null;
  }

  return null;
}

async function storeTokenAndSession({token, sessionObj}) {
  // Token should be stored as a plain string (never JSON.parse it later)
  await Keychain.setGenericPassword('token', token, {
    service: 'agpayAuthToken',
  });

  // Session can be JSON (safe to JSON.parse later)
  await Keychain.setGenericPassword('session', JSON.stringify(sessionObj), {
    service: 'agpaySession',
  });
}

export default function Login({onLoginSuccess}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    try {
      const cleanEmail = String(email || '')
        .trim()
        .toLowerCase();
      const cleanPassword = String(password || ''); // DO NOT lowercase passwords.

      if (!cleanEmail || !cleanPassword) {
        Alert.alert('Missing info', 'Enter email and password.');
        return;
      }

      if (typeof onLoginSuccess !== 'function') {
        console.log(
          'Login error: onLoginSuccess is not a function:',
          onLoginSuccess,
        );
        Alert.alert(
          'App config error',
          'onLoginSuccess not passed from App.js.',
        );
        return;
      }

      setSaving(true);

      // 1) Call backend login (real auth)
      console.log('LOGIN => requesting JWT:', {email: cleanEmail});

      const resp = await fetch(LOGIN_URL, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email: cleanEmail, password: cleanPassword}),
      });

      const rawText = await resp.text();
      console.log('LOGIN => HTTP status:', resp.status);

      const rawJson = safeJsonParse(rawText);
      if (rawJson) {
        console.log('LOGIN => raw JSON:', JSON.stringify(rawJson, null, 2));
      } else {
        console.log('LOGIN => raw text:', rawText);
      }

      if (!resp.ok) {
        Alert.alert('Login failed', `HTTP ${resp.status}. Check logs.`);
        return;
      }

      const normalized = normalizeLoginResponse(rawJson || {});
      console.log('LOGIN => normalized:', JSON.stringify(normalized, null, 2));

      const token = resolveToken(normalized);
      const ownerId = resolveOwnerId(normalized);

      console.log('LOGIN => resolved token present:', !!token);
      console.log('LOGIN => resolved ownerId:', ownerId);

      if (!token) {
        Alert.alert(
          'Login error',
          'No token returned from /login. Check logs.',
        );
        return;
      }

      if (!ownerId) {
        Alert.alert(
          'Login error',
          'No ownerId returned from /login. Check logs so we can map the correct field name.',
        );
        return;
      }

      // 2) Preserve your existing authed gate EXACTLY (do not disturb)
      await Keychain.setGenericPassword(cleanEmail, 'logged_in', {
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
      });

      // 3) Store auth context separately (keeps your existing behavior)
      const authSession = {
        email: cleanEmail,
        ownerId,
        token,
        profile: normalized,
        savedAt: Date.now(),
      };

      await Keychain.setInternetCredentials(
        'agpayAuth',
        'auth',
        JSON.stringify(authSession),
      );

      // 4) Add two safe stores that eliminate the “JSON Parse error: Unexpected character”
      //    - token stored as plain string in service agpayAuthToken
      //    - session stored as JSON in service agpaySession
      await storeTokenAndSession({token, sessionObj: authSession});

      console.log(
        'LOGIN => Keychain saved: generic session + agpayAuth + agpayAuthToken + agpaySession',
      );

      // Pass normalized payload upward so App.js can store it / route correctly
      onLoginSuccess(normalized);
    } catch (e) {
      console.log('Login error:', e);
      Alert.alert('Error', String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.logo}>
          <Text style={styles.logoGold}>AG</Text>Pay
        </Text>
        <Text style={styles.subtitle}>Secure · Fast · In-Person Payments</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@company.com"
            placeholderTextColor="#6b7280"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={t => setEmail(String(t || '').toLowerCase())}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>

          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, {flex: 1}]}
              placeholder="••••••••"
              placeholderTextColor="#6b7280"
              secureTextEntry={!showPassword}
              autoCapitalize="none" // prevents initial caps
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity
              onPress={() => setShowPassword(p => !p)}
              style={styles.eyeBtn}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.loginBtn, saving && {opacity: 0.6}]}
          onPress={handleContinue}
          disabled={saving}>
          <Text style={styles.loginText}>
            {saving ? 'Signing in…' : 'Continue'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.footer}>PCI-compliant · Secured</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const GOLD = '#d4af37';
const GOLD_SOFT = '#f5e6a8';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020617',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#050814',
    borderRadius: 22,
    padding: 26,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  logo: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    color: 'white',
    letterSpacing: 1,
  },
  logoGold: {color: GOLD},
  subtitle: {
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 30,
    fontSize: 13,
  },
  field: {marginBottom: 18},
  label: {color: '#9ca3af', fontSize: 12, marginBottom: 6},
  input: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: 'white',
    fontSize: 15,
  },
  passwordRow: {flexDirection: 'row', alignItems: 'center'},
  eyeBtn: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#374151',
  },
  eyeIcon: {fontSize: 18, color: GOLD_SOFT},
  loginBtn: {
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 10,
  },
  loginText: {
    color: '#020617',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footer: {color: '#6b7280', textAlign: 'center', fontSize: 11, marginTop: 20},
});
