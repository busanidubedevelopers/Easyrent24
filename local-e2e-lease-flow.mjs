// End-to-end check of the invite → admin fee → application → documents →
// lease → signatures flow against a running app (docker compose up).
//
//   node local-e2e-lease-flow.mjs            (defaults to http://localhost:3000)
//   BASE_URL=http://localhost:3001 node local-e2e-lease-flow.mjs
//
// PayFast itself is not called: payments are confirmed through the
// sandbox-only confirm-payment routes, exactly like the demo return pages do.
// Document extraction is exercised only if ANTHROPIC_API_KEY is set on the app
// (otherwise the check expects the "not configured" 503).

const base = process.env.BASE_URL || 'http://localhost:3000';
const stamp = Date.now();

let step = 0;
function ok(label, detail = '') {
  console.log(`  ✓ ${String(++step).padStart(2)} ${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label, res) {
  console.error(`  ✗ ${label}: HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 400)}`);
  process.exit(1);
}

async function call(method, path, { token, body, form, raw } = {}) {
  const headers = { Origin: base };
  if (token) headers.Cookie = `easyrent_token=${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${path}`, { method, headers, body: payload });
  if (raw) return { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) };
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

async function expect(label, promise, wantStatus) {
  const res = await promise;
  const want = Array.isArray(wantStatus) ? wantStatus : [wantStatus];
  if (!want.includes(res.status)) fail(label, res);
  return res;
}

async function signup(role, name, email) {
  const res = await expect(`signup ${role}`, call('POST', '/api/auth/signup', {
    body: { email, password: 'secret123', fullName: name, role },
  }), [200, 201]);
  return res.json.token;
}

(async () => {
  console.log(`E2E lease flow against ${base}\n`);

  // ── Landlord, property, invite ────────────────────────────────────────────
  const landlordToken = await signup('landlord', 'Lindiwe Dlamini', `landlord-${stamp}@example.com`);
  ok('landlord signed up');

  const adminAttempt = await call('POST', '/api/auth/signup', {
    body: { email: `admin-${stamp}@example.com`, password: 'secret123', fullName: 'Mallory', role: 'admin' },
  });
  if (adminAttempt.status !== 400) fail('self-signup as admin must be refused', adminAttempt);
  ok('self-signup as admin refused');

  const property = await expect('create property', call('POST', '/api/properties', {
    token: landlordToken,
    body: { title: `E2E Flat ${stamp}`, address: '45 Main Road, Sea Point', price: 12000, bedrooms: 2, bathrooms: 1, property_type: 'apartment' },
  }), [200, 201]);
  const propertyId = property.json.property?.id ?? property.json.id;
  ok('property listed', propertyId);

  const tenantEmail = `tenant-${stamp}@example.com`;
  const invite = await expect('create invite', call('POST', '/api/invites', {
    token: landlordToken,
    body: { property_id: propertyId, invitee_name: 'Thabo Mokoena', invitee_email: tenantEmail, admin_fee_amount: 500 },
  }), 201);
  const inviteToken = new URL(invite.json.link).searchParams.get('invite');
  ok('invite created', `emailed=${invite.json.emailed}`);

  const preview = await expect('invite preview', call('GET', `/api/invites/${inviteToken}`), 200);
  if (preview.json.invite.admin_fee_amount !== 500 || !preview.json.invite.property?.title) fail('invite preview content', preview);
  ok('invite preview (public)', `${preview.json.invite.property.title}, fee R${preview.json.invite.admin_fee_amount}`);

  const list = await expect('list invites', call('GET', '/api/invites', { token: landlordToken }), 200);
  if (!list.json.invites.some((i) => i.invitee_email === tenantEmail)) fail('invite listed for landlord', list);
  ok('invite appears in landlord list');

  // ── Tenant registers through the invite and pays the admin fee ────────────
  const strangerToken = await signup('tenant', 'Someone Else', `stranger-${stamp}@example.com`);
  await expect('claim with wrong email refused', call('POST', `/api/invites/${inviteToken}/claim`, { token: strangerToken }), 409);
  ok('invite refused for a different email');

  const tenantToken = await signup('tenant', 'Thabo Mokoena', tenantEmail);
  ok('tenant signed up with invited email');

  const earlyApp = await call('POST', '/api/applications', {
    token: tenantToken,
    body: { property_id: propertyId, first_name: 'Thabo', last_name: 'Mokoena', consent_credit: true, consent_id_check: true, consent_bank_statements: true },
  });
  if (earlyApp.status !== 403 || earlyApp.json.code !== 'ADMIN_FEE_UNPAID') fail('application blocked before admin fee', earlyApp);
  ok('application blocked until admin fee is paid');

  await expect('claim invite', call('POST', `/api/invites/${inviteToken}/claim`, { token: tenantToken }), 200);
  ok('invite claimed');

  const feePay = await expect('start admin fee payment', call('POST', `/api/invites/${inviteToken}/pay`, { token: tenantToken }), 200);
  if (feePay.json.fields.amount !== '500.00') fail('admin fee amount from invite', feePay);
  ok('PayFast checkout prepared', `R${feePay.json.fields.amount} ${feePay.json.fields.item_name}`);

  await expect('confirm admin fee (sandbox)', call('POST', `/api/invites/${inviteToken}/confirm-payment`, { token: tenantToken }), 200);
  const claimed = await expect('invite status', call('POST', `/api/invites/${inviteToken}/claim`, { token: tenantToken }), 200);
  if (claimed.json.invite.status !== 'paid') fail('invite marked paid', claimed);
  ok('admin fee paid');

  // ── Application, fee, documents ───────────────────────────────────────────
  const app = await expect('submit application', call('POST', '/api/applications', {
    token: tenantToken,
    body: {
      property_id: propertyId, first_name: 'Thabo', last_name: 'Mokoena', id_number: '8001015009087',
      phone: '0821234567', employer_name: 'Acme Logistics', monthly_income: 40000,
      consent_credit: true, consent_id_check: true, consent_bank_statements: true,
    },
  }), 201);
  const applicationId = app.json.application.id;
  ok('application submitted', applicationId);

  const form = new FormData();
  form.append('file', new Blob(['%PDF-1.4\n% fake payslip for e2e\n'], { type: 'application/pdf' }), 'payslip.pdf');
  form.append('document_type', 'payslip');
  await expect('upload payslip', call('POST', `/api/applications/${applicationId}/documents`, { token: tenantToken, form }), 201);
  ok('payslip uploaded');

  const extract = await call('POST', `/api/applications/${applicationId}/extract`, { token: landlordToken, body: {} });
  if (extract.status === 503) ok('document checks not configured (no ANTHROPIC_API_KEY) — skipped');
  else if (extract.status === 200) ok('document checks ran', `${extract.json.verification.checks.length} checks`);
  else fail('document checks', extract);

  const verification = await expect('verification (landlord)', call('GET', `/api/applications/${applicationId}/extract`, { token: landlordToken }), 200);
  ok('verification visible to landlord', `${verification.json.verification.checks.length} checks, uploaded: ${verification.json.uploaded.join(', ')}`);
  await expect('verification hidden from stranger', call('GET', `/api/applications/${applicationId}/extract`, { token: strangerToken }), 404);
  ok('verification hidden from other users');

  await expect('start application fee', call('POST', `/api/applications/${applicationId}/pay`, { token: tenantToken }), 200);
  await expect('confirm application fee (sandbox)', call('POST', `/api/applications/${applicationId}/confirm-payment`, { token: tenantToken }), 200);
  ok('application fee paid');

  // ── Lease ─────────────────────────────────────────────────────────────────
  const defaults = await expect('lease defaults', call('GET', `/api/applications/${applicationId}/lease`, { token: landlordToken }), 200);
  const terms = { ...defaults.json.defaults, start_date: '2026-11-01', special_conditions: 'One parking bay is included.' };
  const draft = await expect('create lease draft', call('POST', `/api/applications/${applicationId}/lease`, { token: landlordToken, body: terms }), 201);
  const leaseId = draft.json.lease.id;
  if (!draft.json.document.sections.some((s) => s.paragraphs.some((p) => p.includes('31 October 2027')))) fail('lease end date in text', draft);
  ok('lease draft generated', `${draft.json.document.sections.length} sections, ends 31 October 2027`);

  await expect('tenant cannot see draft', call('GET', `/api/leases/${leaseId}`, { token: tenantToken }), 404);
  ok('draft hidden from tenant');

  await expect('send lease', call('POST', `/api/leases/${leaseId}/send`, { token: landlordToken }), 200);
  ok('lease sent (application approved)');

  const tenantView = await expect('tenant views lease', call('GET', `/api/leases/${leaseId}`, { token: tenantToken }), 200);
  if (!tenantView.json.can_sign) fail('tenant can sign', tenantView);
  ok('tenant sees lease and can sign');

  const notes = await expect('tenant notifications', call('GET', '/api/notifications', { token: tenantToken }), 200);
  if (!notes.json.notifications.some((n) => n.type === 'lease_sent')) fail('lease_sent notification', notes);
  ok('tenant notified', `${notes.json.unread} unread`);

  await expect('landlord cannot sign first', call('POST', `/api/leases/${leaseId}/sign`, { token: landlordToken, body: { full_name: 'Lindiwe Dlamini', accept: true } }), 409);
  await expect('wrong name refused', call('POST', `/api/leases/${leaseId}/sign`, { token: tenantToken, body: { full_name: 'Someone Else', accept: true } }), 400);
  await expect('tenant signs', call('POST', `/api/leases/${leaseId}/sign`, { token: tenantToken, body: { full_name: 'thabo  mokoena', accept: true } }), 200);
  ok('tenant signed (name/order rules enforced)');

  const executed = await expect('landlord countersigns', call('POST', `/api/leases/${leaseId}/sign`, { token: landlordToken, body: { full_name: 'Lindiwe Dlamini', accept: true } }), 200);
  if (executed.json.lease.status !== 'executed') fail('lease executed', executed);
  ok('landlord countersigned — lease executed');

  const pdf = await call('GET', `/api/leases/${leaseId}/pdf`, { token: tenantToken, raw: true });
  const header = new TextDecoder().decode(pdf.bytes.slice(0, 5));
  if (pdf.status !== 200 || header !== '%PDF-') fail('signed PDF download', { status: pdf.status, json: { header } });
  ok('signed PDF downloaded by tenant', `${(pdf.bytes.length / 1024).toFixed(1)} KB`);

  await expect('stranger cannot download', call('GET', `/api/leases/${leaseId}/pdf`, { token: strangerToken }), 404);
  ok('PDF hidden from other users');

  const leases = await expect('tenant lease list', call('GET', '/api/leases', { token: tenantToken }), 200);
  if (!leases.json.leases.some((l) => l.id === leaseId && l.status === 'executed')) fail('lease in tenant list', leases);
  ok('lease listed under My Lease');

  console.log('\nALL CHECKS PASSED');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
