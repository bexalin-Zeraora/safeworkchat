// Login session storage.
//  - normal login  : sessionStorage -> each browser TAB has its own login (log in as different users in different tabs)
//  - "Remember me" : localStorage   -> stays after the browser is closed (one user per browser)
// Logging out in one tab no longer logs out your other tabs, and tabs can't overwrite each other's keys.
(function () {
  const KEYS = ['token', 'user', 'e2ee_pk', 'e2ee_sk'];
  const sess = {
    get(k) { const v = sessionStorage.getItem(k); return v !== null ? v : localStorage.getItem(k); },
    set(k, v, remember) {
      (remember ? localStorage : sessionStorage).setItem(k, v);
      (remember ? sessionStorage : localStorage).removeItem(k);
    },
    remove(k) { sessionStorage.removeItem(k); localStorage.removeItem(k); },
    clear() { KEYS.forEach((k) => sess.remove(k)); },
    remembered() { return localStorage.getItem('token') !== null; }
  };
  window.sess = sess;

  // Back/forward button: never show an app page from the browser's page cache after logout
  window.addEventListener('pageshow', (e) => {
    const onLogin = /\/login\.html$/.test(location.pathname);
    if (!onLogin && !sess.get('token')) location.replace('/pages/login.html');
  });
})();
