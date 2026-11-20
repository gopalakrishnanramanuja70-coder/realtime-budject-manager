fetch('/api/me').then(async (r) => {
  await r.text();
  if (!r.ok) return;
  const open = '<a href="/app" class="btn btn-primary">Open your budget</a>';
  document.getElementById('account-nav').innerHTML = open;
  document.getElementById('footer-nav').innerHTML = '<a href="/app" class="btn btn-quiet">Open your budget</a>';
  document.getElementById('hero-actions').innerHTML = '<a href="/app" class="btn btn-primary btn-lg">Open your budget</a>';
  document.getElementById('cta-actions').innerHTML = '<a href="/app" class="btn btn-primary btn-lg">Open your budget</a>';
}).catch(() => {});
