// ONE rule set for passwords, used by the browser (live checklist) and by the server (the real check).
(function (root) {
  const WEAK = ['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop', 'admin123', 'welcome1', 'welcome123',
    'iloveyou', 'letmein1', 'abc12345', 'abcd1234', 'passw0rd', 'p@ssw0rd', 'p@ssword1', 'changeme', '11111111', '00000000', 'asdfghjkl', 'zaq12wsx', 'monkey123', 'dragon123', 'football1'];
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const WEAK_SET = new Set(WEAK.map(norm));

  function contains(pw, part) { const p = norm(part); return p.length >= 3 && norm(pw).includes(p); }

  // every rule: id, label shown to the user, test
  const RULES = [
    { id: 'len',     label: 'At least 8 characters (up to 128)',        ok: (p) => p.length >= 8 && p.length <= 128 },
    { id: 'lower',   label: 'A lowercase letter (a-z)',                 ok: (p) => /[a-z]/.test(p) },
    { id: 'upper',   label: 'An uppercase letter (A-Z)',                ok: (p) => /[A-Z]/.test(p) },
    { id: 'digit',   label: 'A number (0-9)',                           ok: (p) => /[0-9]/.test(p) },
    { id: 'special', label: 'A special character, for example ! @ # $ %', ok: (p) => /[^A-Za-z0-9\s]/.test(p) },
    { id: 'common',  label: 'Not a common password',                    ok: (p) => !WEAK_SET.has(norm(p)) },
    { id: 'self',    label: 'Does not contain your username or email name', ok: (p, c) => !(c && (contains(p, c.username || '') || contains(p, String(c.email || '').split('@')[0]))) }
  ];

  const PasswordRules = {
    RULES,
    check(pw, ctx) { pw = typeof pw === 'string' ? pw : ''; return RULES.map((r) => ({ id: r.id, label: r.label, ok: r.ok(pw, ctx) })); },
    firstProblem(pw, ctx) {
      if (typeof pw !== 'string') return 'Password is required';
      const bad = PasswordRules.check(pw, ctx).find((r) => !r.ok);
      return bad ? 'Password rule not met: ' + bad.label.charAt(0).toLowerCase() + bad.label.slice(1) : null;
    },
    strength(pw, ctx) {
      if (!pw) return { score: 0, label: '' };
      const res = PasswordRules.check(pw, ctx), met = res.filter((r) => r.ok).length;
      let score;
      if (!res.every((r) => r.ok)) score = (pw.length < 8 || met <= 3) ? 0 : 1;     // a rule is still missing
      else score = pw.length >= 16 ? 4 : pw.length >= 12 ? 3 : 2;                  // all rules met: longer is stronger
      return { score, label: ['Weak', 'Fair', 'Good', 'Strong', 'Very strong'][score] };
    }
  };

  // ---- browser only: live checklist + strength bar under a password field ----
  PasswordRules.attach = function (input, box, getCtx, confirmInput) {
    box.classList.add('pw-box');
    box.innerHTML = '<div class="pw-bar"><i></i></div><div class="pw-label"></div><ul class="pw-rules"></ul><div class="pw-match"></div>';
    const bar = box.querySelector('.pw-bar i'), label = box.querySelector('.pw-label'), ul = box.querySelector('.pw-rules'), match = box.querySelector('.pw-match');
    const colors = ['#e5484d', '#f5a524', '#c9b22c', '#10a463', '#0d8a53'];
    function render() {
      const ctx = getCtx ? getCtx() : null, v = input.value, res = PasswordRules.check(v, ctx), st = PasswordRules.strength(v, ctx);
      ul.textContent = '';
      res.forEach((r) => { const li = document.createElement('li'); li.className = r.ok ? 'ok' : (v ? 'bad' : ''); li.textContent = (r.ok ? '✓ ' : '• ') + r.label; ul.appendChild(li); });
      bar.style.width = v ? ((st.score + 1) * 20) + '%' : '0'; bar.style.background = colors[st.score];
      label.textContent = v ? 'Strength: ' + st.label : '';
      if (confirmInput) {
        const c = confirmInput.value;
        match.textContent = c ? (c === v ? '✓ Passwords match' : 'Passwords do not match') : '';
        match.className = 'pw-match ' + (c ? (c === v ? 'ok' : 'bad') : '');
      }
    }
    input.addEventListener('input', render); if (confirmInput) confirmInput.addEventListener('input', render);
    render(); return render;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PasswordRules; else root.PasswordRules = PasswordRules;
})(typeof window !== 'undefined' ? window : globalThis);
