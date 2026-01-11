/**
 * Servicio para interactuar con Gemini API v1beta
 * Usa la API REST de Google Generative Language
 * Totalmente seguro: API Key en variables de entorno
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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

  try {
    const response = await fetchWithRetries(`${API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json() as GeminiResponse;

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Respuesta inválida de Gemini API');
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error en Gemini:', error.message);
      throw error;
    }
    throw new Error('Error desconocido en Gemini API');
  }
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

  try {
    const response = await fetchWithRetries(`${API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json() as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta';
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error analizando imagen:', error.message);
      throw error;
    }
    throw new Error('Error al analizar imagen con Gemini');
  }
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
