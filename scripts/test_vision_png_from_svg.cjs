const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');

(async () => {
  try {
    const credsPath = path.join(__dirname, '..', 'credentials_base64.txt');
    const b64 = fs.readFileSync(credsPath, 'utf8').trim();
    const jsonStr = Buffer.from(b64, 'base64').toString('utf8');
    const creds = JSON.parse(jsonStr);

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-vision',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    const privateKey = creds.private_key;
    if (!privateKey) throw new Error('No private_key found in credentials');

    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(token)}`
    });

    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      console.error('TOKEN_EXCHANGE_FAILED');
      console.error(tokenData);
      process.exit(1);
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200">\n` +
      `<rect width="100%" height="100%" fill="white"/>\n` +
      `<text x="40" y="120" font-family="Arial, Helvetica, sans-serif" font-size="72" fill="black">Prueba OCR 123</text>\n` +
      `</svg>`;

    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const pngBase64 = pngBuffer.toString('base64');

    const visionResp = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content: pngBase64 },
            features: [{ type: 'TEXT_DETECTION' }]
          }
        ]
      })
    });

    const visionData = await visionResp.json();

    if (!visionResp.ok) {
      console.error('VISION_API_ERROR_STATUS=' + visionResp.status);
      console.error(JSON.stringify(visionData, null, 2));
      process.exit(1);
    }

    const extracted = (visionData.responses?.[0]?.fullTextAnnotation?.text) || (visionData.responses?.[0]?.textAnnotations?.[0]?.description) || '';
    console.log('VISION_CALL: OK');
    console.log('extracted_length=' + (extracted ? extracted.length : 0));
    if (extracted) console.log('extracted_text=' + extracted.replace(/\n/g, ' '));

    process.exit(0);
  } catch (err) {
    console.error('TEST_ERROR');
    console.error(err && (err.message || err));
    process.exit(1);
  }
})();
