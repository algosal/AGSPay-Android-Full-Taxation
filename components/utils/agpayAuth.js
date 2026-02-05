// FILE: components/utils/agpayAuth.js
import * as Keychain from 'react-native-keychain';

export async function readAgpayAuthToken() {
  try {
    const tokenCreds = await Keychain.getGenericPassword({
      service: 'agpayAuthToken',
    });
    if (tokenCreds?.password && typeof tokenCreds.password === 'string') {
      return tokenCreds.password;
    }

    const internet = await Keychain.getInternetCredentials('agpayAuth');
    if (internet?.password) {
      const session = JSON.parse(internet.password);
      if (session?.token) return session.token;
    }

    return null;
  } catch (e) {
    console.log('readAgpayAuthToken error:', e);
    return null;
  }
}

export async function readAgpaySession() {
  try {
    const sessCreds = await Keychain.getGenericPassword({
      service: 'agpaySession',
    });
    if (sessCreds?.password) {
      return JSON.parse(sessCreds.password);
    }

    const internet = await Keychain.getInternetCredentials('agpayAuth');
    if (internet?.password) {
      return JSON.parse(internet.password);
    }

    return null;
  } catch (e) {
    console.log('readAgpaySession error:', e);
    return null;
  }
}

export async function readAgpaySelection() {
  try {
    const creds = await Keychain.getInternetCredentials('agpaySelection');
    if (!creds?.password) return null;
    return JSON.parse(creds.password);
  } catch (e) {
    console.log('readAgpaySelection error:', e);
    return null;
  }
}
