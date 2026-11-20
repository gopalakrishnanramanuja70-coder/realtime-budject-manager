(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const form = $('#auth-form');
  const params = new URLSearchParams(location.search);
  let mode = params.get('mode') === 'signup' ? 'signup' : 'login';
  let firstAccountUnclaimed = false;

  const copy = {
    login: { title: 'Log in', sub: 'Pick up where you left off.', submit: 'Log in', busy: 'Logging in…', switchText: 'New to Expensify?', switchLink: 'Create an account', autocomplete: 'current-password' },
    signup: { title: 'Create your account', sub: 'Your budget stays private to you.', submit: 'Create account', busy: 'Creating account…', switchText: 'Already have an account?', switchLink: 'Log in', autocomplete: 'new-password' }
  };

  function paint() {
    const c = copy[mode];
    $('#auth-title').textContent = c.title;
    $('#auth-sub').textContent = c.sub;
    $('#auth-submit').textContent = c.submit;
    $('#switch-text').textContent = c.switchText;
    const link = $('#switch-link');
    link.textContent = c.switchLink;
    link.href = mode === 'login' ? '/login?mode=signup' : '/login';
    $('#password').autocomplete = c.autocomplete;
    $('#pw-hint').hidden = mode !== 'signup';
    $('#claim-note').hidden = !(mode === 'signup' && firstAccountUnclaimed);
    $('#auth-error').hidden = true;
    document.title = `${c.title} | Expensify`;
  }

  function showError(message, field) {
    const el = $('#auth-error');
    el.textContent = message;
    el.hidden = false;
    if (field) field.focus();
  }

  $('#switch-link').addEventListener('click', (e) => {
    e.preventDefault();
    mode = mode === 'login' ? 'signup' : 'login';
    history.replaceState(null, '', mode === 'signup' ? '/login?mode=signup' : '/login');
    paint();
  });

  $('#pw-toggle').addEventListener('click', (e) => {
    const input = $('#password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'Hide' : 'Show';
    e.currentTarget.setAttribute('aria-pressed', String(show));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    const password = $('#password').value;
    if (!email) return showError('Enter your email address.', $('#email'));
    if (!password) return showError('Enter your password.', $('#password'));
    if (mode === 'signup' && password.length < 8) return showError('Use at least 8 characters for your password.', $('#password'));
    const btn = $('#auth-submit');
    btn.disabled = true;
    btn.textContent = copy[mode].busy;
    try {
      const res = await fetch(mode === 'login' ? '/api/login' : '/api/signup', {
        method: 'POST',
        headers: { 'X-Expensify': '1' },
        body: new URLSearchParams({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || 'Something went wrong. Try again.', mode === 'signup' && res.status === 400 ? $('#email') : $('#password'));
        return;
      }
      location.assign('/app');
    } catch {
      showError('Could not reach the server. Check that Expensify is running, then try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = copy[mode].submit;
    }
  });

  paint();
  fetch('/api/me').then(async (r) => { await r.text(); if (r.ok) location.replace('/app'); }).catch(() => {});
  fetch('/api/status').then((r) => r.json()).then((s) => { firstAccountUnclaimed = !!s.unclaimed; paint(); }).catch(() => {});
})();
