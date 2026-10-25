// Input checks shared by the register / profile / password routes. Passwords use the SAME rules the browser shows.
const PasswordRules = require('../frontend/js/passwordRules.js');

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

const checkUsername = (v) => {
  if (typeof v !== 'string') return 'Username is required';
  const u = v.trim();
  if (u.length < 2 || u.length > 30) return 'Username must be 2 to 30 characters';
  if (/[<>"'&]/.test(u)) return 'Username cannot contain < > " \' or &';
  return null;
};
const checkEmail = (v) => {
  if (typeof v !== 'string') return 'Email is required';
  const e = v.trim();
  if (e.length > 100 || !EMAIL.test(e)) return 'Enter a valid email address';
  return null;
};
const checkPassword = (pw, ctx) => PasswordRules.firstProblem(pw, ctx);

module.exports = { checkUsername, checkEmail, checkPassword };
