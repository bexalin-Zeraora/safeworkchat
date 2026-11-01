// Verifies a Google "ID token" (the credential the Google button gives the browser).
// Checks the signature against Google's public keys, the expiry, the issuer and that it was issued for THIS app.
const { OAuth2Client } = require('google-auth-library');
let client = null;

async function verify(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured on this server');
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4000) throw new Error('Invalid Google credential');
  client = client || new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const p = ticket.getPayload();
  return { sub: String(p.sub), email: String(p.email || '').toLowerCase(), emailVerified: p.email_verified === true, name: String(p.name || '') };
}

module.exports = { verify };
