import * as Keychain from 'react-native-keychain';

export async function readAgpayAuthToken() {
  try {
    // Preferred: token stored as plain string (service: agpayAuthToken)
    const tokenCreds = await Keychain.getGenericPassword({
      service: 'agpayAuthToken',
    });
    if (tokenCreds?.password && typeof tokenCreds.password === 'string') {
      return tokenCreds.password;
    }

    // Fallback: your existing storage (internet creds: agpayAuth)
    const internet = await Keychain.getInternetCredentials('agpayAuth');
    if (internet?.password) {
      const session = JSON.parse(internet.password);
      if (session?.token) return session.token;
    }

    console.log('readAgpayAuthToken: no token found');
    return null;
  } catch (e) {
    console.log('readAgpayAuthToken error:', e);
    return null;
  }
}

export async function readAgpaySession() {
  try {
    // Preferred: session stored as JSON (service: agpaySession)
    const sessCreds = await Keychain.getGenericPassword({
      service: 'agpaySession',
    });
    if (sessCreds?.password) {
      return JSON.parse(sessCreds.password);
    }

    // Fallback: internet creds
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
