/**
 * Servicio para interactuar con Gemini API v1beta
 * Usa la API REST de Google Generative Language
 * Totalmente seguro: API Key en variables de entorno
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_KEYS_CSV = import.meta.env.VITE_GEMINI_API_KEYS || '';
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Build keys array: prefer VITE_GEMINI_API_KEYS CSV, fallback to single key
const GEMINI_KEYS: string[] = GEMINI_API_KEYS_CSV
  ? GEMINI_API_KEYS_CSV.split(',').map(k => k.trim()).filter(Boolean)
  : (GEMINI_API_KEY ? [GEMINI_API_KEY] : []);
let geminiKeyIndex = 0;

const SYSTEM_INSTRUCTION = "Eres 'Conferente', un asistente avanzado de IA especializado en análisis de datos, consultoría estratégica y gestión inteligente de información. Tu tono es profesional, analítico pero accesible. Estás integrado en una PWA diseñada para ayudar a usuarios a tomar decisiones basadas en datos. Cuando presentes datos o conclusiones, usa un formato estructurado y claro.";

export interface GeminiRequest {
  system_instruction?: {
    parts: Array<{ text: string }>;
  };
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
}

export interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
  error?: {
    message: string;
  };
}

/**
 * Envía un mensaje a Gemini y obtiene una respuesta
 */
export async function callGeminiAPI(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY no está configurada. Verifica tu .env.local');
  }

  const requestBody: GeminiRequest = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }]
    },
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
  };

  // Try using available keys, rotate on 429/quota errors
  const errors: Error[] = [];
  const keysToTry = GEMINI_KEYS.length ? GEMINI_KEYS : (GEMINI_API_KEY ? [GEMINI_API_KEY] : []);
  if (!keysToTry.length) throw new Error('No Gemini API keys available. Configure VITE_GEMINI_API_KEY or VITE_GEMINI_API_KEYS.');
  for (let attempt = 0; attempt < keysToTry.length; attempt++) {
    const key = keysToTry[(geminiKeyIndex + attempt) % keysToTry.length];
    try {
      const response = await fetchWithRetries(`${API_URL}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json() as GeminiResponse;
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Respuesta inválida de Gemini API');
      }
      // Advance index so next call prefers next key
      geminiKeyIndex = (geminiKeyIndex + attempt) % keysToTry.length;
      return data.candidates[0].content.parts[0].text;
    } catch (err: any) {
      console.error('Gemini key attempt failed:', err?.message || err);
      errors.push(err instanceof Error ? err : new Error(String(err)));
      const msg = (err && err.message) ? err.message : '';
      // If error is not a quota/rate-limit, stop trying
      if (!/quota|rate limit|429|exceeded/i.test(msg)) break;
      // otherwise try next key
      continue;
    }
  }
  const all = errors.map(e => e.message).join(' | ');
  throw new Error(`Todas las claves Gemini fallaron: ${all}`);
}

/**
 * Analiza una imagen con Gemini (base64)
 */
export async function analyzeImageWithGemini(imageBase64: string, prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY no está configurada');
  }

  // Remover prefijo data:image/... si existe
  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

  const requestBody = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }]
    },
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
        ],
      },
    ],
  };

  const errors: Error[] = [];
  const keysToTry = GEMINI_KEYS.length ? GEMINI_KEYS : (GEMINI_API_KEY ? [GEMINI_API_KEY] : []);
  if (!keysToTry.length) throw new Error('No Gemini API keys available. Configure VITE_GEMINI_API_KEY or VITE_GEMINI_API_KEYS.');
  for (let attempt = 0; attempt < keysToTry.length; attempt++) {
    const key = keysToTry[(geminiKeyIndex + attempt) % keysToTry.length];
    try {
      const response = await fetchWithRetries(`${API_URL}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json() as GeminiResponse;
      geminiKeyIndex = (geminiKeyIndex + attempt) % keysToTry.length;
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta';
    } catch (err: any) {
      console.error('Gemini image attempt failed:', err?.message || err);
      errors.push(err instanceof Error ? err : new Error(String(err)));
      const msg = (err && err.message) ? err.message : '';
      if (!/quota|rate limit|429|exceeded/i.test(msg)) break;
      continue;
    }
  }
  const all = errors.map(e => e.message).join(' | ');
  throw new Error(`Todas las claves Gemini fallaron: ${all}`);
}

/**
 * Helper: sleep ms
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper: fetch with retry/backoff for 429 responses
 */
const DEFAULT_RETRIES = Number(import.meta.env.VITE_GEMINI_RETRIES) || 5;
async function fetchWithRetries(input: RequestInfo, init?: RequestInit, retries = DEFAULT_RETRIES) {
  let attempt = 0;
  while (true) {
    const res = await fetch(input, init);
    if (res.ok) return res;

    // Try to parse error body
    let errBody: any = null;
    try {
      errBody = await res.clone().json();
    } catch {}

    // If quota/rate limit (429), retry with backoff
    if (res.status === 429 && attempt < retries) {
      attempt++;
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : Math.min(1000 * 2 ** attempt, 10000);
      console.warn(`Gemini rate limited (429). Reintentando en ${waitMs}ms (intento ${attempt}/${retries})`);
      await sleep(waitMs);
      continue;
    }

    // For other errors, throw with parsed message when possible
    const message = errBody?.error?.message || res.statusText || `HTTP ${res.status}`;
    const e: any = new Error(`Error en Gemini API: ${message}`);
    (e as any).status = res.status;
    throw e;
  }
}

/**
 * Chat en streaming (para implementar en el futuro)
 */
export async function createChatSession() {
  return {
    sendMessage: async (message: string) => {
      return callGeminiAPI(message);
    }
  };
}
