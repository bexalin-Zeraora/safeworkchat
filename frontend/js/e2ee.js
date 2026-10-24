// End-to-end encryption helpers (TweetNaCl: X25519 + XSalsa20-Poly1305).
// Works over plain http on a LAN (does not need the browser's secure-context-only crypto.subtle).
// The server only ever sees public keys, wrapped group keys, and ciphertext.
(function (root) {
  const nacl = root.nacl;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const KDF_ROUNDS = 120000;

  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

  // password -> 32-byte key (iterated SHA-512; slows brute force of a stolen key backup)
  function kdf(password, salt) {
    let h = nacl.hash(cat(salt, enc.encode(password)));
    for (let i = 0; i < KDF_ROUNDS; i++) h = nacl.hash(cat(h, salt));
    return h.subarray(0, 32);
  }

  const E = {
    genKeys() { const k = nacl.box.keyPair(); return { pk: b64(k.publicKey), sk: b64(k.secretKey) }; },

    fingerprint(pk) {
      const h = nacl.hash(unb64(pk));
      return Array.from(h.subarray(0, 8)).map((x) => x.toString(16).padStart(2, '0')).join('').replace(/(.{4})/g, '$1 ').trim();
    },

    // encrypt the private key with the password so it can be recovered on another device
    backup(sk, password) {
      const salt = nacl.randomBytes(16), nonce = nacl.randomBytes(24);
      const box = nacl.secretbox(unb64(sk), nonce, kdf(password, salt));
      return { salt: b64(salt), nonce: b64(nonce), cipher: b64(box) };
    },
    unlock(bk, password) {
      try {
        const sk = nacl.secretbox.open(unb64(bk.cipher), unb64(bk.nonce), kdf(password, unb64(bk.salt)));
        return sk ? b64(sk) : null;
      } catch (e) { return null; }
    },

    newGroupKey() { return b64(nacl.randomBytes(32)); },

    // wrap a group key for one recipient
    wrapKey(groupKey, recipientPk, mySk, myPk) {
      const nonce = nacl.randomBytes(24);
      const box = nacl.box(unb64(groupKey), nonce, unb64(recipientPk), unb64(mySk));
      return { wrapped: b64(box), nonce: b64(nonce), senderPk: myPk };
    },
    unwrapKey(k, mySk) {
      try {
        const out = nacl.box.open(unb64(k.wrapped), unb64(k.nonce), unb64(k.senderPk), unb64(mySk));
        return out ? b64(out) : null;
      } catch (e) { return null; }
    },

    encryptMsg(text, groupKey) {
      const nonce = nacl.randomBytes(24);
      const box = nacl.secretbox(enc.encode(text), nonce, unb64(groupKey));
      return b64(cat(nonce, box));
    },
    decryptMsg(payload, groupKey) {
      try {
        const all = unb64(payload);
        const out = nacl.secretbox.open(all.subarray(24), all.subarray(0, 24), unb64(groupKey));
        return out ? dec.decode(out) : null;
      } catch (e) { return null; }
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.E2EE = E;
})(typeof window !== 'undefined' ? window : globalThis);
