const token = new URLSearchParams(location.search).get('token') || '';
const alertBox = document.getElementById('alertBox'), form = document.getElementById('resetForm');
const say = (m, t = 'danger') => { alertBox.textContent = m; alertBox.className = 'alert alert-' + t; };
if (!/^[a-f0-9]{64}$/.test(token)) { say('This reset link is not valid. Request a new one from the login page.'); form.hidden = true; }
PasswordRules.attach(document.getElementById('np'), document.getElementById('pwRules'), () => ({}), document.getElementById('np2'));
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('np').value;
  const problem = PasswordRules.firstProblem(password, {});
  if (problem) return say(problem + '.');
  if (password !== document.getElementById('np2').value) return say('The two passwords do not match.');
  document.getElementById('rb').disabled = true;
  try {
    const r = await fetch('/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { document.getElementById('rb').disabled = false; return say(d.message || 'Could not change the password.'); }
    say(d.message || 'Password changed. Redirecting to login…', 'success'); form.hidden = true;
    setTimeout(() => { location.href = '/pages/login.html'; }, 2000);
  } catch (err) { document.getElementById('rb').disabled = false; say('Network error. Please try again.'); }
});
