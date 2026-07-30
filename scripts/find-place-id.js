'use strict';
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load SA from env or key file — no hardcoded keys
function getServiceAccount() {
  const raw = process.env.GOOGLE_SA_JSON;
  if (raw) return JSON.parse(raw);
  const keyFile = process.env.GOOGLE_SA_KEY_FILE ||
    path.join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw', 'credentials', 'google-service-account.json');
  if (fs.existsSync(keyFile)) return JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  throw new Error('Set GOOGLE_SA_JSON or GOOGLE_SA_KEY_FILE env var.');
}
const SA = getServiceAccount();

function makeJwt(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(header + '.' + claims);
  return header + '.' + claims + '.' + sign.sign(privateKey, 'base64url');
}

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = ''; res.on('data', c => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const jwt = makeJwt(SA.client_email, SA.private_key);
  const body = 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt;
  const res = await httpRequest({
    hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
  }, body);
  const parsed = JSON.parse(res.body);
  if (!parsed.access_token) throw new Error('Token error: ' + res.body);
  return parsed.access_token;
}

async function main() {
  const token = await getToken();
  console.log('Got token');

  // Text search for Wheatland Construction in El Dorado KS
  const searchBody = JSON.stringify({
    textQuery: 'Wheatland Construction El Dorado KS',
    locationBias: {
      circle: {
        center: { latitude: 37.8175, longitude: -96.8628 },
        radius: 20000
      }
    }
  });

  const res = await httpRequest({
    hostname: 'places.googleapis.com',
    path: '/v1/places:searchText',
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
      'Content-Length': Buffer.byteLength(searchBody)
    }
  }, searchBody);

  console.log('Status:', res.status);
  console.log(res.body);
}

main().catch(err => { console.error(err.message); process.exit(1); });
