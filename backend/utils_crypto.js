// Validation helpers for end-to-end encryption payloads (the server never decrypts anything)
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const isB64 = (s, max = 200) => typeof s === 'string' && s.length > 0 && s.length <= max && B64.test(s);

const cleanKeyBackup = (k) => (k && isB64(k.salt, 40) && isB64(k.nonce, 40) && isB64(k.cipher, 200))
  ? { salt: k.salt, nonce: k.nonce, cipher: k.cipher } : null;

const cleanWrappedKey = (k) => (k && isB64(k.wrapped, 120) && isB64(k.nonce, 40) && isB64(k.senderPk, 60))
  ? { wrapped: k.wrapped, nonce: k.nonce, senderPk: k.senderPk } : null;

// 32-byte public key -> 44 base64 chars
const isPublicKey = (s) => isB64(s, 44) && s.length === 44;

// encrypted message payload (nonce + ciphertext), generous cap
const isCipher = (s) => isB64(s, 8000);

module.exports = { isB64, cleanKeyBackup, cleanWrappedKey, isPublicKey, isCipher };
