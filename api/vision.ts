import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel API endpoint para Google Cloud Vision Text Detection
 * Usa Service Account autenticado por credenciales en variable de entorno GOOGLE_CLOUD_CREDENTIALS
 */

async function getAccessToken(credentials: any): Promise<string> {
  try {
    const crypto = require('crypto');
    
    // Crear JWT header y payload
    const header = Buffer.from(JSON.stringify({
      alg: 'RS256',
      typ: 'JWT',
    })).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const iat = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-vision',
      aud: 'https://oauth2.googleapis.com/token',
      exp: iat + 3600,
      iat: iat,
    })).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const signature_input = `${header}.${payload}`;

    // Firmar con la clave privada
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(signature_input)
      .sign(credentials.private_key, 'base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const jwt = `${signature_input}.${signature}`;

    // Obtener access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    const tokenData: any = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
    }

    return tokenData.access_token;
  } catch (error) {
    console.error('Token generation error:', error);
    throw error;
  }
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

    // Obtener credenciales de Service Account
    const credentialsBase64 = process.env.GOOGLE_CLOUD_CREDENTIALS;
    if (!credentialsBase64) {
      console.error('GOOGLE_CLOUD_CREDENTIALS not configured');
      return res.status(500).json({ error: 'Vision credentials not configured' });
    }

    // Decodificar credenciales
    const credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
    const credentials = JSON.parse(credentialsJson);

    console.log('Credentials loaded for:', credentials.client_email);

    // Obtener access token
    const accessToken = await getAccessToken(credentials);
    console.log('Access token obtained');

    // Llamar a Vision API
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

    console.log('Vision response status:', visionResponse.status);

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Vision API error:', errorText);
      return res.status(visionResponse.status).json({
        error: 'Vision API error',
        message: errorText,
      });
    }

    const data: any = await visionResponse.json();
    const annotation = data.responses?.[0];
    const fullText = annotation?.fullTextAnnotation?.text || (annotation?.textAnnotations?.[0]?.description) || '';

    console.log('Vision text extracted, length:', fullText.length);
    return res.status(200).json({ text: fullText });
    
  } catch (error: any) {
    console.error('Vision API endpoint error:', error);
    return res.status(500).json({ 
      error: 'Vision API error',
      message: error?.message || 'Unknown error',
    });
  }
}
