// FILE: components/Terminal/tokenProvider.js

// IMPORTANT:
// Stripe Terminal expects tokenProvider to be a FUNCTION that returns a STRING.
// Your error says tokenProvider is an OBJECT, so keep this as a named export OR default export,
// and import it correctly.

const CONNECTION_TOKEN_URL = 'PUT_YOUR_CONNECTION_TOKEN_ENDPOINT_HERE';

// If you use JWT auth, pass it in from caller
export async function tokenProvider({jwt} = {}) {
  const resp = await fetch(CONNECTION_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? {Authorization: `Bearer ${jwt}`} : {}),
    },
    body: JSON.stringify({}),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`tokenProvider HTTP ${resp.status}: ${text}`);
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  // Handle common API Gateway proxy shapes
  let body = json;
  if (json && typeof json.body === 'string') {
    try {
      body = JSON.parse(json.body);
    } catch {
      body = json;
    }
  }

  const secret = body?.secret || body?.connectionToken || body?.token;

  if (!secret || typeof secret !== 'string') {
    throw new Error(`tokenProvider: missing token in response: ${text}`);
  }

  return secret;
}
