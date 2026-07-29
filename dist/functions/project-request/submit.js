/**
 * /project-request/submit — Wheatland Construction Project Request Form Handler
 * Cloudflare Pages Function
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

  const emailBody = [
    'New project request from wheatlandconstruction.com',
    '',
    '─── Contact ───────────────────────────────',
    'Name:    ' + name,
    'Email:   ' + email,
    'Phone:   ' + phone,
    '',
    '─── Project Details ───────────────────────',
    'Address: ' + address,
    'City:    ' + city + ', ' + (state || 'KS') + ' ' + zip,
    'Type:    ' + project_type,
    'Budget:  ' + budget,
    'Timeline:' + timeline,
    '',
    'Description:',
    description,
    '',
    'Heard via: ' + (how_heard || 'not specified'),
    '',
    '─────────────────────────────────────────',
    'Submitted via wheatlandconstruction.com project request form'
  ].join('\n');

  const notifyEmail = env.NOTIFY_EMAIL || 'tylernorris@killergrowth.com';

  try {
    await sendGmail(env, {
      to: notifyEmail,
      subject: 'Project Request: ' + name + ' — ' + project_type,
      body: emailBody,
      replyTo: email
    });

    return Response.redirect('/project-request/?sent=1', 303);
  } catch (err) {
    console.error('Gmail send error:', err);
    return jsonError('Failed to submit request. Please call us at (316) 322-7898.', 500);
  }
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function sendGmail(env, { to, subject, body, replyTo }) {
  const saKey = JSON.parse(env.GOOGLE_SA_KEY_JSON);
  const subject_email = 'brickley@killergrowth.com';

  const token = await getServiceAccountToken(saKey, subject_email, 'https://www.googleapis.com/auth/gmail.send');

  const raw = buildMimeMessage({ from: subject_email, to, subject, body, replyTo });

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw })
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('Gmail API ' + res.status + ': ' + errBody);
  }
}

function buildMimeMessage({ from, to, subject, body, replyTo }) {
  const lines = [
    'From: Wheatland Construction <' + from + '>',
    'To: ' + to,
    'Subject: ' + subject,
    replyTo ? 'Reply-To: ' + replyTo : '',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body
  ].filter(l => l !== undefined);

  return btoa(unescape(encodeURIComponent(lines.join('\r\n'))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getServiceAccountToken(saKey, subjectEmail, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: saKey.client_email, sub: subjectEmail, scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  };

  const headerB64 = b64url(JSON.stringify(header));
  const claimB64  = b64url(JSON.stringify(claim));
  const toSign    = headerB64 + '.' + claimB64;
  const signature = await signRS256(toSign, saKey.private_key);
  const jwt       = toSign + '.' + signature;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('Token: ' + JSON.stringify(data));
  return data.access_token;
}

function b64url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signRS256(data, pemKey) {
  const keyData = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(data)
  );
  return btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
