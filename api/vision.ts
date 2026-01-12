import { VercelRequest, VercelResponse } from '@vercel/node';
import vision from '@google-cloud/vision';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    // Get credentials from environment variable (should be base64-encoded JSON)
    const credentialsBase64 = process.env.GOOGLE_CLOUD_CREDENTIALS;
    if (!credentialsBase64) {
      return res.status(500).json({ error: 'GOOGLE_CLOUD_CREDENTIALS not configured' });
    }

    // Decode base64 credentials to get JSON
    const credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
    const credentials = JSON.parse(credentialsJson);

    // Create Vision client with explicit credentials
    const client = new vision.ImageAnnotatorClient({
      credentials,
    });

    // Prepare image for Vision API
    const image = {
      content: imageBase64,
    };

    // Call Google Vision API with TEXT_DETECTION feature
    const [result] = await client.textDetection(image);
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      return res.status(200).json({ text: '' });
    }

    // First annotation contains the full text
    const fullText = detections[0]?.description || '';

    return res.status(200).json({ text: fullText });
  } catch (error: any) {
    console.error('Vision API error:', error);
    return res.status(500).json({
      error: 'Vision API error',
      message: error?.message || 'Unknown error',
    });
  }
}
