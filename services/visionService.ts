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

    // Read the body once and determine how to parse it
    const responseText = await response.text();
    
    // Try to parse as JSON
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Vision API returned non-JSON response:', responseText.substring(0, 200));
      throw new Error(`Vision API returned invalid response: ${responseText.substring(0, 100)}`);
    }

    if (!response.ok) {
      const errorMsg = data?.message || data?.error || response.statusText;
      console.error('Vision API error:', response.status, errorMsg);
      // Check if client should use offline OCR
      if (data?.shouldUseOfflineOCR || response.status >= 500) {
        throw new Error(`Vision API unavailable (${response.status}): falling back to offline OCR`);
      }
      throw new Error(`Vision API error: ${errorMsg}`);
    }

    return data.text || '';
  } catch (error) {
    if (error instanceof Error) {
      console.error('Vision service error:', error.message);
      throw error;
    }
    throw new Error('Vision service error');
  }
}

