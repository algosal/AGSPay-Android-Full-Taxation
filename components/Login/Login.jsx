import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

export default function Login({onLoginSuccess}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        {/* Brand */}
        <Text style={styles.logo}>
          <Text style={styles.logoGold}>AG</Text>Pay
        </Text>
        <Text style={styles.subtitle}>Secure · Fast · In-Person Payments</Text>

        {/* Email */}
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
            onChangeText={t => setEmail(t.toLowerCase())}
          />
        </View>

        {/* Password */}
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>

          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, {flex: 1}]}
              placeholder="••••••••"
              placeholderTextColor="#6b7280"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
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

        {/* Login */}
        <TouchableOpacity style={styles.loginBtn} onPress={onLoginSuccess}>
          <Text style={styles.loginText}>Continue</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footer}>PCI-compliant · Stripe-secured</Text>
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

  logoGold: {
    color: GOLD,
  },

  subtitle: {
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 30,
    fontSize: 13,
  },

  field: {
    marginBottom: 18,
  },

  label: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 6,
  },

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

  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  eyeBtn: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#374151',
  },

  eyeIcon: {
    fontSize: 18,
    color: GOLD_SOFT,
  },

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

  footer: {
    color: '#6b7280',
    textAlign: 'center',
    fontSize: 11,
    marginTop: 20,
  },
});
