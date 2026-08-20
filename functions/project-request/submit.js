/**
 * /project-request/submit — Wheatland Construction Project Request Form Handler
 * Cloudflare Pages Function
 *
 * Impersonates: notifications@killergrowth.com (domain-wide delegation)
 * Sends from: Wheatland Construction <notifications@killergrowth.com>
 *
 * Environment secrets:
 *   TURNSTILE_SECRET_KEY  — CF Turnstile secret
 *   GOOGLE_SA_KEY_JSON    — Service account JSON (stringified)
 *   NOTIFY_EMAIL          — recipient (tylernorris@killergrowth.com)
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    body = await request.json();
  } else {
    const fd = await request.formData();
    body = Object.fromEntries(fd.entries());
  }

  const {
    name, email, phone, address, city, state, zip,
    project_type, budget, timeline, description, how_heard
  } = body;
  const turnstileToken = body['cf-turnstile-response'];

  if (!name || !email || !phone || !address || !city || !zip || !project_type || !budget || !timeline || !description) {
    return jsonError('Missing required fields.', 400);
  }

  // Validate Turnstile
  if (env.TURNSTILE_SECRET_KEY && turnstileToken) {
    const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: turnstileToken,
        remoteip: request.headers.get('CF-Connecting-IP')
      })
    });
    const tsData = await tsRes.json();
    if (!tsData.success) {
      return jsonError('Security check failed. Please try again.', 403);
    }
  }

  const notifyEmail = env.NOTIFY_EMAIL || 'contact@wheatlandconstruction.com';
  const subject = 'Project Request: ' + name + ' / ' + project_type;
  const htmlBody = buildHtmlEmail({ name, email, phone, address, city, state, zip, project_type, budget, timeline, description, how_heard });

  try {
    const saKey = JSON.parse(env.GOOGLE_SA_KEY_JSON);
    const accessToken = await getGoogleAccessToken(saKey.private_key, saKey.client_email);

    await sendGmail(accessToken, {
      to: notifyEmail,
      replyTo: email,
      subject,
      body: htmlBody,
      bodyType: 'html'
    });

    const host = request.headers.get('host') || 'wheatlandconstruction.com';
    const proto = host.includes('localhost') ? 'http' : 'https';
    return Response.redirect(proto + '://' + host + '/project-request/?sent=1', 303);

  } catch (err) {
    console.error('Submit error:', err.message || err);
    return jsonError('Failed to submit request. Please call us at (316) 322-7898.', 500);
  }
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// --- Google JWT + Gmail helpers (proven pattern from StewardRight worker) ---

async function getGoogleAccessToken(privateKeyPem, clientEmail) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    sub: 'notifications@killergrowth.com',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const b64url = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  // Strip PEM headers — handle both literal \n escape sequences and real newlines
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '')   // literal \n (from JSON stringification)
    .replace(/\s+/g, '');  // actual whitespace/newlines

  const derBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    derBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  const b64sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const jwt = `${signingInput}.${b64sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`No access token returned: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

async function sendGmail(accessToken, { to, replyTo, subject, body, bodyType = 'html' }) {
  const subjectEncoded = '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(subject))) + '?=';

  const mime = [
    `From: Wheatland Construction <notifications@killergrowth.com>`,
    `To: ${to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${subjectEncoded}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/${bodyType}; charset=utf-8`,
    ``,
    body,
  ].join('\r\n');

  // TextEncoder handles unicode/HTML safely
  const mimeBytes = new TextEncoder().encode(mime);
  let binary = '';
  mimeBytes.forEach(b => binary += String.fromCharCode(b));
  const encoded = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/notifications@killergrowth.com/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send failed: ${err}`);
  }

  return res.json();
}

// --- HTML email builder ---

function buildHtmlEmail({ name, email, phone, address, city, state, zip, project_type, budget, timeline, description, how_heard }) {
  const gold = '#C8922A';
  const dark = '#2a2a2a';
  const row = (label, value) => !value ? '' : `
        <tr>
          <td style="padding:9px 14px;font-weight:600;color:#666;font-size:13px;white-space:nowrap;width:110px;border-bottom:1px solid #f0f0f0;">${label}</td>
          <td style="padding:9px 14px;color:${dark};font-size:13px;border-bottom:1px solid #f0f0f0;">${value}</td>
        </tr>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f0f0" style="padding:32px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.10);">

  <!-- Header -->
  <tr><td style="background:${dark};padding:28px 32px 22px;">
    <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${gold};">WHEATLAND CONSTRUCTION</p>
    <p style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">New Project Request</p>
  </td></tr>
  <tr><td style="background:${gold};height:4px;"></td></tr>

  <!-- Intro -->
  <tr><td style="padding:24px 32px 8px;">
    <p style="margin:0;font-size:15px;color:#444;line-height:1.6;">A new project request was submitted at <a href="https://wheatlandconstruction.com" style="color:${gold};font-weight:600;">wheatlandconstruction.com</a>.</p>
  </td></tr>

  <!-- Contact -->
  <tr><td style="padding:20px 32px 0;">
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${gold};">Contact</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
      ${row('Name', name)}
      ${row('Email', '<a href="mailto:' + email + '" style="color:' + gold + ';">' + email + '</a>')}
      ${row('Phone', '<a href="tel:' + phone.replace(/\D/g, '') + '" style="color:' + gold + ';">' + phone + '</a>')}
    </table>
  </td></tr>

  <!-- Project -->
  <tr><td style="padding:20px 32px 0;">
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${gold};">Project Details</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
      ${row('Address', address)}
      ${row('City', city + ', ' + (state || 'KS') + ' ' + zip)}
      ${row('Type', project_type)}
      ${row('Budget', budget)}
      ${row('Timeline', timeline)}
      ${row('Heard Via', how_heard || 'not specified')}
    </table>
  </td></tr>

  <!-- Description -->
  <tr><td style="padding:20px 32px;">
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${gold};">Description</p>
    <div style="background:#fafafa;border:1px solid #e8e8e8;border-radius:6px;padding:16px 18px;font-size:13px;color:${dark};line-height:1.75;">${(description || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#fafafa;border-top:1px solid #e8e8e8;padding:18px 32px;">
    <p style="margin:0;font-size:11px;color:#999;">Sent automatically from wheatlandconstruction.com &mdash; reply to respond directly to ${name}.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
