import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel API endpoint para Google Cloud Vision Text Detection
 * Usa Service Account autenticado por credenciales en variable de entorno GOOGLE_CLOUD_CREDENTIALS
 * 
 * Espera:
 *   POST /api/vision
 *   Body: { imageBase64: "..." }
 * 
 * Devuelve:
 *   { text: "..." } o error
 */

async function getAccessToken(credentials: any): Promise<string> {
  const crypto = require('crypto');
  
  // Crear JWT
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud: 'https://oauth2.googleapis.com/token',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };

  const encode = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header_encoded = encode(header);
  const payload_encoded = encode(payload);
  const signature_input = `${header_encoded}.${payload_encoded}`;

  // Sign with private key
  const key = credentials.private_key;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signature_input)
    .sign(key, 'base64url');

  const jwt = `${signature_input}.${signature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData: any = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error('Failed to obtain access token');
  }

  return tokenData.access_token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 required in body' });
    }

    // Obtener credenciales de Service Account desde variable de entorno (base64-encoded)
    const credentialsBase64 = process.env.GOOGLE_CLOUD_CREDENTIALS;
    if (!credentialsBase64) {
      console.error('GOOGLE_CLOUD_CREDENTIALS not configured');
      return res.status(500).json({ error: 'Vision credentials not configured' });
    }

    // Decodificar y parsear credenciales
    const credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
    const credentials = JSON.parse(credentialsJson);

    // Obtener access token
    const accessToken = await getAccessToken(credentials);

    // Llamar a Vision API con REST
    const visionResponse = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBase64 },
            features: [{ type: 'TEXT_DETECTION' }],
          },
        ],
      }),
    });

    if (!visionResponse.ok) {
      const errorData = await visionResponse.json();
      console.error('Vision API error:', errorData);
      return res.status(visionResponse.status).json({
        error: 'Vision API error',
        message: errorData?.error?.message || visionResponse.statusText,
      });
    }

    const data: any = await visionResponse.json();
    const annotation = data.responses?.[0];
    const fullText = annotation?.fullTextAnnotation?.text || (annotation?.textAnnotations?.[0]?.description) || '';

    return res.status(200).json({ text: fullText });
  } catch (error) {
    console.error('Vision API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
