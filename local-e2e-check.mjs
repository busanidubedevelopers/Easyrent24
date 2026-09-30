const base = 'http://localhost:3000';

function makeEmail(prefix) {
  const stamp = Date.now();
  return `${prefix}-${stamp}@example.com`;
}

async function postJson(url, body, authToken = '', extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', ...extraHeaders };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: res.status, json, headers: Object.fromEntries(res.headers.entries()) };
}

(async () => {
  const landlordEmail = makeEmail('landlord');
  const tenantEmail = makeEmail('tenant');

  const landlord = await postJson(`${base}/api/auth/signup`, {
    email: landlordEmail,
    password: 'secret123',
    fullName: 'Landlord E2E',
    role: 'landlord',
  });

  if (landlord.status >= 400) {
    console.error('LANDLORD_SIGNUP_RAW', JSON.stringify({ status: landlord.status, json: landlord.json }, null, 2));
    throw new Error(`Landlord signup failed: ${JSON.stringify(landlord.json)}`);
  }

  const landlordToken = landlord.json?.token;
  const tenant = await postJson(`${base}/api/auth/signup`, {
    email: tenantEmail,
    password: 'secret123',
    fullName: 'Tenant E2E',
    role: 'tenant',
  });

  if (tenant.status >= 400) {
    throw new Error(`Tenant signup failed: ${JSON.stringify(tenant.json)}`);
  }

  const property = await postJson(
    `${base}/api/properties`,
    {
      title: 'E2E Test Property',
      address: '12 Test Street',
      price: 1450,
      bedrooms: 2,
      bathrooms: 1,
      property_type: 'apartment',
    },
    landlordToken
  );

  if (property.status >= 400) {
    throw new Error(`Property creation failed: ${JSON.stringify(property.json)}`);
  }

  const invoice = await postJson(
    `${base}/api/invoices`,
    {
      recipient_id: tenant.json.user.id,
      line_items: [{ description: 'Rent', amount: 1450, locked: true }],
      due_date: '2026-09-30',
    },
    landlordToken
  );

  if (invoice.status >= 400) {
    throw new Error(`Invoice creation failed: ${JSON.stringify(invoice.json)}`);
  }

  console.log('OK');
  console.log(JSON.stringify({
    landlord: { status: landlord.status, email: landlordEmail },
    tenant: { status: tenant.status, email: tenantEmail },
    property: { status: property.status, id: property.json?.property?.id },
    invoice: { status: invoice.status, id: invoice.json?.invoice?.id, amount: invoice.json?.invoice?.amount },
  }, null, 2));
})();
