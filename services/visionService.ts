/**
 * Servicio para usar Google Cloud Vision vía Vercel API endpoint
 * El endpoint maneja la autenticación con Service Account
 * Espera una imagen en base64 y devuelve el texto detectado.
 */

const VISION_ENDPOINT = '/api/vision';

export async function analyzeImageWithVision(base64Image: string): Promise<string> {
  try {
    const response = await fetch(VISION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Image }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Vision API error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    return data.text || '';
  } catch (error) {
    if (error instanceof Error) {
      console.error('Vision service error:', error.message);
      throw error;
    }
    throw new Error('Vision service error');
  }
}

