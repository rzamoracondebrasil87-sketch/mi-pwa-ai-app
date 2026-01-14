import { VercelRequest, VercelResponse } from '@vercel/node';
// import jwt from 'jsonwebtoken'; // REMOVED - using API key auth instead
import { logger } from '../services/logger';

/**
 * Extrae datos estructurados de texto OCR con máxima precisión
 * Maneja comas como decimales, fechas en formato DD/MM/AA, saltos de línea, etc.
 */
function extraerDatosEtiqueta(texto: string) {
  // Normalizar: eliminar saltos de línea extras y espacios múltiples
  const textoNormalizado = texto
    .replace(/\s+/g, ' ') // Múltiples espacios/líneas → un espacio
    .trim();

  // Patrones regex ajustados para robustez
  const patrones = {
    // Producto: busca nombres comunes de productos cárnicos
    produto: /(?:ASA\s*RESF|CARNE|FRANGO|SUÍNO|PEITO|CORTE|FILÉ|COXA|SOBRECOXA|PERNIL|COSTELA|TOUCINHO)\b/i,
    
    // Fechas: DD/MM/AA o DD/MM/AAAA
    dataProducao: /(?:DATA\s*PRODUÇÃO|PRODUÇÃO|FAB|FABRICAÇÃO)\s*[:\s]*(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{2,4})/i,
    dataValidade: /(?:DATA\s*VALIDADE|VALIDADE|VENC|VENCIMENTO)\s*[:\s]*(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{2,4})/i,
    
    // Lote: "Lote 123456" o "L: 123456"
    lote: /(?:LOTE|L\s*[\:\=]?)\s*([A-Z0-9\-]+)/i,
    
    // Pesos: maneja comas y puntos como decimales
    pesoLiquido: /PESO\s*L[ÍI]QUIDO\s*[\:\=]?\s*([\d,\.]+)\s*KG/i,
    pesoBruto: /PESO\s*BRUTO\s*[\:\=]?\s*([\d,\.]+)\s*KG/i,
    tara: /TARA\s*[\:\=]?\s*([\d,\.]+)\s*KG/i,
    
    // Código de barras: secuencia de 13-18 dígitos
    codigoBarras: /\b(\d{13,18})\b/,
    
    // SIF (número de registro)
    sif: /SIF\s*[\:\=]?\s*(\d+)/i,
    
    // Tipo de produto (congelado, resfriado, etc)
    tipo: /(?:CONGELAD[OA]|RESFIAD[OA]|FRESC[OA]|DESCONGELAD[OA])/i,
    
    // Temperatura: busca valores negativos o con rango
    temperatura: /(?:MANTER|CONSERVAR)?\s*(?:CONGELAD[OA]\s+)?(?:A|EM)?\s*(-?\d+)\s*°?C?/i,
  };

  // Función auxiliar para limpiar números: convierte comas a puntos
  const limparNumero = (valor: string | undefined): string => {
    if (!valor) return '0';
    return valor.replace(',', '.').trim();
  };

  // Función auxiliar para normalizar fechas
  const normalizarFecha = (dia: string, mes: string, ano: string): string => {
    const anoNum = parseInt(ano, 10);
    // Si año < 100, asumir 2000+ (26 → 2026)
    const anoFinal = anoNum < 100 ? 2000 + anoNum : anoNum;
    return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${anoFinal}`;
  };

  // Extraer con regexes
  const matchProduto = texto.match(patrones.produto);
  const matchProdAo = texto.match(patrones.dataProducao);
  const matchValidade = texto.match(patrones.dataValidade);
  const matchLote = texto.match(patrones.lote);
  const matchPesoLiq = texto.match(patrones.pesoLiquido);
  const matchPesoBr = texto.match(patrones.pesoBruto);
  const matchTara = texto.match(patrones.tara);
  const matchCodBar = texto.match(patrones.codigoBarras);
  const matchSif = texto.match(patrones.sif);
  const matchTipo = texto.match(patrones.tipo);
  const matchTemp = texto.match(patrones.temperatura);

  return {
    produto: matchProduto?.[0] || '',
    data_producao: matchProdAo 
      ? normalizarFecha(matchProdAo[1], matchProdAo[2], matchProdAo[3])
      : '',
    data_validade: matchValidade
      ? normalizarFecha(matchValidade[1], matchValidade[2], matchValidade[3])
      : '',
    lote: matchLote?.[1]?.trim() || '',
    peso_liquido_kg: matchPesoLiq ? parseFloat(limparNumero(matchPesoLiq[1])) : null,
    peso_bruto_kg: matchPesoBr ? parseFloat(limparNumero(matchPesoBr[1])) : null,
    tara_kg: matchTara ? parseFloat(limparNumero(matchTara[1])) : null,
    codigo_barras: matchCodBar?.[1] || '',
    sif: matchSif?.[1] || null,
    tipo: matchTipo?.[0]?.toLowerCase() || '',
    temperatura_rotulo: matchTemp?.[1] || null,
    texto_original_limpio: textoNormalizado,
  };
}

/**
 * Simplified Vision API using API key authentication
 * No JWT required - uses direct API key auth
 */

async function callVisionAPI(imageBase64: string, apiKey: string): Promise<any> {
  try {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: {
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

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Vision API error response:', response.status, errorText);
      throw new Error(`Vision API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    logger.debug('Vision API call successful');
    return data;
  } catch (error: any) {
    logger.error('Vision API call failed:', error?.message || String(error));
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ALWAYS set JSON header first
  res.setHeader('Content-Type', 'application/json');
  
  // Wrap everything in a top-level try-catch
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 required in body' });
    }

    logger.debug('Vision API request received, image size:', imageBase64.length);

    // Get API key (simpler authentication)
    const apiKey = process.env.GOOGLE_VISION_API_KEY || 
                   process.env.VITE_GOOGLE_VISION_KEY ||
                   process.env.GOOGLE_CLOUD_API_KEY;
    
    if (!apiKey) {
      logger.warn('GOOGLE_VISION_API_KEY not configured');
      return res.status(503).json({ 
        error: 'Vision API not configured',
        message: 'Please use offline OCR in the browser',
        shouldUseOfflineOCR: true 
      });
    }

    // Call Vision API directly with API key
    let visionData: any;
    try {
      visionData = await callVisionAPI(imageBase64, apiKey);
    } catch (visionError: any) {
      logger.error('Vision API call failed:', visionError?.message);
      return res.status(502).json({
        error: 'Vision API error',
        message: visionError?.message || 'Could not process image',
        shouldUseOfflineOCR: true
      });
    }

    const annotation = visionData.responses?.[0];
    
    if (annotation?.error) {
      logger.error('Vision API returned error:', annotation.error?.message || annotation.error);
      return res.status(400).json({
        error: 'Vision API error',
        message: annotation.error?.message || 'Unknown',
        shouldUseOfflineOCR: true
      });
    }

    const fullText = annotation?.fullTextAnnotation?.text || (annotation?.textAnnotations?.[0]?.description) || '';
    logger.debug('Vision text extracted, length:', fullText.length);
    
    // Extraer datos estructurados
    const datosEtiqueta = extraerDatosEtiqueta(fullText);
    
    // Validaciones de negocio
    const validaciones = [];
    if (datosEtiqueta.peso_bruto_kg && datosEtiqueta.peso_liquido_kg) {
      if (datosEtiqueta.peso_bruto_kg < datosEtiqueta.peso_liquido_kg) {
        validaciones.push('⚠️ Peso bruto menor que peso líquido (posible error)');
      }
    }
    
    // Validar fechas
    if (datosEtiqueta.data_producao && datosEtiqueta.data_validade) {
      try {
        const [diaProd, mesProd, anoProd] = datosEtiqueta.data_producao.split('/').map(Number);
        const [diaVal, mesVal, anoVal] = datosEtiqueta.data_validade.split('/').map(Number);
        const fechaProd = new Date(anoProd, mesProd - 1, diaProd);
        const fechaVal = new Date(anoVal, mesVal - 1, diaVal);
        
        if (fechaProd > fechaVal) {
          validaciones.push('⚠️ Fecha de producción posterior a validez (posible error)');
        }
      } catch (e) {
        logger.debug('Validación de fechas fallida');
      }
    }
    
    return res.status(200).json({ 
      text: fullText,
      datos: datosEtiqueta,
      validaciones: validaciones.length > 0 ? validaciones : null,
    });
    
  } catch (error: any) {
    logger.error('Vision API CRITICAL ERROR:', error?.message || error, error?.stack);
    
    // ALWAYS return valid JSON, even on critical errors
    try {
      return res.status(500).json({
        error: 'Vision API error',
        message: error?.message || 'Unknown error occurred',
        timestamp: new Date().toISOString(),
        shouldUseOfflineOCR: true
      });
    } catch (responseError) {
      // If even response fails, log it
      logger.error('CRITICAL: Could not send error response:', responseError);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
