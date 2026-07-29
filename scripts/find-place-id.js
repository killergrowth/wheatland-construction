'use strict';
const crypto = require('crypto');
const https = require('https');

const SA = {
  "type": "service_account",
  "project_id": "killergrowth",
  "private_key_id": "f77e7df8e3fe79361520ad188c85b0c7e411b4de",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDIogq7ZokpxYIk\nndaddLHbrswuErT3698XyAOfDTRY6y4+5+IpmzLj2JM5jG/EKQuoHv+Yg3x4NoJG\nKs6fa9jmiDyRxB4vnO8QHXAvVOh4dUHRGIhFYcyb3u2elK8957WPmqgFmK2j5YFL\nUFqf24ym8vBtqDoBaE1k/f2Y12Sbst+9LSg00DIKoyXV2Kj1FLtzwjrmFlPfiWMd\nPgYnukTRdrUGyhu36cRsDg8+6+biF0gJAMwQHq1LH3gW6FpWZkkjqA8o7f+n2rB3\n67F+nYL852vjEXe3eqWZtQaE39gXXP65ICvI0Qc3Rb/CqCksW4DPS09c/uTuU3Rg\njOD0gzuvAgMBAAECggEAVDS+cFzeoKuGrbuZQciihWNdytCLJ6rVnXOTIYQ3PkKm\nzDwijffXag2R7QtmNVxMyikIeYhmC0ZFcxGwWvS2ujrfwQYg7Tbel1LjrNnkH/qG\nvy2etBASAjGUZYRd8It5hmYQsxibeDhxBZ0aDBHnfIJmKn/6qHCQWxzG/QkZ7sZr\nYRl4WsLttfzzyRf010CKjfN/cAUQZxEgqKNrkXsW3Q3BYaYsE/1BjIVkqDQAOKl8\nUr/ylkR7+AiQH3lzDAH29pZIkB1lEiC5G+9hnTsrCEKUpocRW1BnZ3APMJW/ab0r\nzti0aQNWRM4Fu4jQWsRWTynxCvXD+2nRkh0dP57KAQKBgQD4EomR/eeNFjpumyZ6\nWdY9uUwis/ldMzLZBboZ9Zous7/DfKGHETi7NznRFFJ+h+s4f6opUB53V5+eff7s\n2Cq156hIee74sm295OXyr/FVVjvmJDNGueVcgLcnySc3cgxMeAGTwo8+aU/wP0SK\n5sMzrfrkYUDNh8dVAPm32Mu9gQKBgQDPC2fqPIlyhUIJpvVJXL5fNxnZP05OQFyl\nvGrF5e5+w2lpYgfXScarfIDXMmR3EeCqEZdc+3aFF/WjgRu8oHRlHz9QYxtYynKO\nuNd+UoJU0gtlMqG72S0YeqCzVnhj5OCDYkQ4S23s1xQSeOxD+olOkWy1nhsidwqT\n5fslHjXxLwKBgHbl05/wdPGvTLREko2jz0ZoMHCVmBgueNmBoC/fAlYN+wREENs+\nytUYZBKszdktZfT/Y1xHtUJ38d4x/2QfO2FSNdr+7iWux2BzfC70WxQOr8jfYuAs\nKx1J5/8erzgo5nIkNoVOg/9i1FiOylhUwAxd/9lEL54SzNwWCpouQ4CBAoGBAKiF\ncSRv97QWEQVINvhqm61mbQyuAW+h5YclEIdZusDFD2SuXRF3xFRKd5gxNSLRk1r6\nDIirSPHV6aMW8FudAoBYabFlqZmg1pOikgwI3nppqMrK5me+wnzdOzYdmMo+PhvS\nfRKRGr0e5wCOGkjOgLpJlgFR2mY4HIz7MWsp5uATAoGAfCSAE0J0atRu/l+nnol3\nIvqbJWdW6M9P+2qRRJFT6xbfoDZBs3OK+OUu5B+Bj9PKq1b7X4aQUCxuEQMTqsBw\nHdAN2cGobpVp8UEkkCOSyhG8okgLsJP7Mpubq3l/qFCs82D3m10yGzhIoFe0+fRd\nt6GNfLzvz8Ki/1SIKdNZXEs=\n-----END PRIVATE KEY-----\n",
  "client_email": "openclaw-agent@killergrowth.iam.gserviceaccount.com",
  "client_id": "107427718762183690869"
};

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
