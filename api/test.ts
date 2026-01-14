import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    // Test environment variables
    const gcpCreds = process.env.GOOGLE_CLOUD_CREDENTIALS ? 'FOUND' : 'NOT_FOUND';
    const geminiKey = process.env.VITE_GEMINI_API_KEY ? 'FOUND' : 'NOT_FOUND';
    const geminiKeys = process.env.VITE_GEMINI_API_KEYS ? 'FOUND' : 'NOT_FOUND';
    
    // Try to decode credentials
    let credsStatus = 'NOT_ATTEMPTED';
    let credsError = '';
    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
      try {
        const decoded = Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        credsStatus = parsed.type ? 'VALID' : 'INVALID';
      } catch (e: any) {
        credsStatus = 'ERROR';
        credsError = e?.message || 'Unknown error';
      }
    }
    
    return res.status(200).json({
      status: 'ok',
      environment: {
        GOOGLE_CLOUD_CREDENTIALS: gcpCreds,
        VITE_GEMINI_API_KEY: geminiKey,
        VITE_GEMINI_API_KEYS: geminiKeys,
      },
      credentials: {
        status: credsStatus,
        error: credsError,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Test endpoint error',
      message: error?.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
