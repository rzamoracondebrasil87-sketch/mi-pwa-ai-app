/**
 * Servicio especializado para lectura inteligente de etiquetas de productos
 * Usando Gemini 2.0 Flash con prompt optimizado
 */

import { callGeminiAPI } from './geminiService';
import { logger } from './logger';

export interface LabelReadingResult {
    supplier: string;
    product: string;
    expiration: string;
    batch: string;
    tara: number | null;
    storage: 'frozen' | 'refrigerated' | 'dry' | '';
    temperature_range: string;
    weight_net?: number;
    weight_gross?: number;
    confidence: 'alta' | 'media' | 'baja';
    warning?: string;
}

/**
 * Lee una etiqueta de producto desde una imagen en base64
 * Retorna un JSON estructurado con los campos críticos
 */
export async function readProductLabel(imageBase64: string): Promise<LabelReadingResult> {
    const prompt = `Eres un especialista en lectura de etiquetas de productos alimentarios y de logística.

Analiza esta imagen de una etiqueta de producto cuidadosamente.

Extrae y devuelve SOLO un JSON válido (sin explicaciones adicionales) con exactamente estos campos:

{
  "supplier": "Nombre del proveedor o fabricante (si no se ve claramente, dejar vacío)",
  "product": "Nombre del producto",
  "expiration": "Fecha de vencimiento en formato DD/MM/AAAA (si no se ve, dejar vacío)",
  "batch": "Número de lote (si no se ve, dejar vacío)",
  "tara": "Peso del envase en kg como número (ej: 1.5 o 2), o null si no se ve",
  "storage": "Una de: 'frozen' (congelado -18°C), 'refrigerated' (refrigerado 4°C), 'dry' (seco/temperatura ambiente), o '' si no se determina",
  "temperature_range": "Rango de temperatura como string (ej: '-18°C', '0-4°C', 'Ambiente'), o 'N/A' si no está especificado",
  "weight_net": "Peso neto en kg si está visible, o null",
  "weight_gross": "Peso bruto en kg si está visible, o null",
  "confidence": "Tu confianza en la lectura: 'alta', 'media' o 'baja'",
  "warning": "Si hay algo crítico (fecha a punto de vencer, producto dañado, etc.), indicarlo aquí. Si no, dejar vacío"
}

IMPORTANTE:
- Si un campo no se ve claramente, mejor déjalo vacío o null que inventar datos
- Sé preciso con números y fechas
- Identifica correctamente el tipo de almacenamiento
- Devuelve SOLO el JSON, sin texto adicional`;

    try {
        logger.debug('Reading label from image, sending to Gemini...');
        
        const responseText = await callGeminiAPI(prompt);
        
        // Extract JSON from response (might have extra text)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No valid JSON found in Gemini response');
        }

        const result: LabelReadingResult = JSON.parse(jsonMatch[0]);
        
        // Validate and clean result
        return {
            supplier: (result.supplier || '').trim(),
            product: (result.product || '').trim(),
            expiration: (result.expiration || '').trim(),
            batch: (result.batch || '').trim(),
            tara: typeof result.tara === 'number' ? result.tara : null,
            storage: ['frozen', 'refrigerated', 'dry'].includes(result.storage) ? result.storage : '',
            temperature_range: (result.temperature_range || '').trim(),
            weight_net: typeof result.weight_net === 'number' ? result.weight_net : undefined,
            weight_gross: typeof result.weight_gross === 'number' ? result.weight_gross : undefined,
            confidence: ['alta', 'media', 'baja'].includes(result.confidence) ? result.confidence : 'media',
            warning: (result.warning || '').trim(),
        };
    } catch (error) {
        logger.error('Label reading error:', error);
        throw error;
    }
}

/**
 * Detecta cambios críticos en el producto comparado con el último registro
 */
export function detectCriticalChanges(
    current: LabelReadingResult,
    previous?: LabelReadingResult
): string[] {
    const warnings: string[] = [];

    if (!previous) return warnings;

    // Cambio de proveedor
    if (current.supplier !== previous.supplier && current.supplier && previous.supplier) {
        warnings.push(`Proveedor cambió: ${previous.supplier} → ${current.supplier}`);
    }

    // Cambio de lote
    if (current.batch !== previous.batch && current.batch && previous.batch) {
        warnings.push(`Lote diferente: ${previous.batch} → ${current.batch}`);
    }

    // Cambio de tipo de almacenamiento
    if (current.storage !== previous.storage && current.storage && previous.storage) {
        warnings.push(`Tipo de almacenamiento cambió: ${previous.storage} → ${current.storage}`);
    }

    // Tara diferente (más de 10% de variación)
    if (current.tara && previous.tara) {
        const variance = Math.abs(current.tara - previous.tara) / previous.tara;
        if (variance > 0.1) {
            warnings.push(`Tara significativamente diferente: ${previous.tara}kg → ${current.tara}kg`);
        }
    }

    return warnings;
}
