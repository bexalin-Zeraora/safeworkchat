// Server-side protection of the encryption private key for accounts that sign in with Google.
// Google proves identity but gives no secret to lock a key with, so (instead of asking for an extra
// passphrase) the server keeps the key wrapped with KEY_WRAP_SECRET (AES-256-GCM) and hands it to the
// browser after a successful Google login. Password accounts keep the browser-side passphrase backup.
const crypto = require('crypto');
const nacl = require('tweetnacl');

function wrapKey() {
  const secret = process.env.KEY_WRAP_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('KEY_WRAP_SECRET is not set');
  return crypto.createHash('sha256').update('swc-key-wrap:' + secret).digest();
}
const b64 = (u8) => Buffer.from(u8).toString('base64');

function wrap(secretKeyB64) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', wrapKey(), iv);
  const ct = Buffer.concat([c.update(Buffer.from(secretKeyB64, 'base64')), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}
function unwrap(s) {
  const [v, iv, tag, ct] = String(s || '').split('.');
  if (v !== 'v1' || !iv || !tag || !ct) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', wrapKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('base64');
  } catch (e) { return null; }
}
// new key pair made on the server: { publicKey, secretKey, serverKey }
function generate() {
  const k = nacl.box.keyPair();
  const secretKey = b64(k.secretKey);
  return { publicKey: b64(k.publicKey), secretKey, serverKey: wrap(secretKey) };
}
const publicFromSecret = (sk) => b64(nacl.box.keyPair.fromSecretKey(Buffer.from(sk, 'base64')).publicKey);

module.exports = { wrap, unwrap, generate, publicFromSecret };
