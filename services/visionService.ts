/**
 * Servicio para usar Google Cloud Vision (TEXT_DETECTION) vía REST
 * Espera una imagen en base64 (sin prefijo) y devuelve el texto detectado.
 */

const VISION_API_KEY = import.meta.env.VITE_GOOGLE_VISION_KEY;
const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';

export async function analyzeImageWithVision(base64Image: string): Promise<string> {
  if (!VISION_API_KEY) {
    throw new Error('VITE_GOOGLE_VISION_KEY no está configurada. Configure la variable de entorno.');
  }

  const body = {
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: 'TEXT_DETECTION', maxResults: 5 }]
      }
    ]
  };

  const res = await fetch(`${VISION_URL}?key=${VISION_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let errText = res.statusText;
    try { const j = await res.json(); errText = j.error?.message || errText; } catch {}
    throw new Error(`Vision API error: ${errText}`);
  }

  const data = await res.json();
  const annotation = data.responses?.[0];
  const text = annotation?.fullTextAnnotation?.text || (annotation?.textAnnotations?.[0]?.description) || '';
  return text;
}
