import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
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
 * Vercel API endpoint para Google Cloud Vision Text Detection
 * Usa Service Account autenticado con JWT de jsonwebtoken
 */

async function getAccessToken(credentials: any): Promise<string> {
  try {
    // Crear JWT con la librería jsonwebtoken
    const token = jwt.sign(
      {
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-vision',
        aud: 'https://oauth2.googleapis.com/token',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      },
      credentials.private_key,
      { algorithm: 'RS256' }
    );

    logger.debug('JWT created, requesting access token...');

    // Intercambiar JWT por access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`,
    });

    const tokenData: any = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      logger.error('Token exchange failed');
      throw new Error(`Token error`);
    }

    logger.debug('Access token obtained successfully');
    return tokenData.access_token;
  } catch (error) {
    logger.error('Token generation error:', error?.message || error);
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set response headers to always return JSON
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 required in body' });
    }

      logger.debug('Vision API request received, image size:', imageBase64.length);

    // Obtener credenciales de Service Account (try multiple sources)
    const credentialsBase64 = process.env.GOOGLE_CLOUD_CREDENTIALS || 
                              process.env.VITE_GOOGLE_CLOUD_CREDENTIALS ||
                              process.env.GCP_CREDENTIALS;
    if (!credentialsBase64) {
        logger.error('GOOGLE_CLOUD_CREDENTIALS not configured in environment');
        logger.error('Available env keys:', Object.keys(process.env).filter(k => k.includes('GOOGLE') || k.includes('GCP')));
      return res.status(500).json({ error: 'Vision credentials not configured', details: 'Check server environment variables' });
    }

    // Decodificar credenciales
    try {
      const credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
      const credentials = JSON.parse(credentialsJson);

        logger.debug('Credentials decoded successfully');

    // Obtener access token
    const accessToken = await getAccessToken(credentials);

    // Llamar a Vision API
      logger.debug('Calling Vision API...');
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

      logger.debug('Vision response status:', visionResponse.status);

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
        logger.error('Vision API error response:', errorText);
      return res.status(visionResponse.status).json({
        error: 'Vision API error',
        message: errorText.substring(0, 200), // Limit error message length
      });
    }

    const data: any = await visionResponse.json();
    const annotation = data.responses?.[0];
    
    if (annotation?.error) {
      logger.error('Vision API returned error:', annotation.error?.message || annotation.error);
      return res.status(400).json({
        error: 'Vision API error',
        message: annotation.error?.message || 'Unknown',
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
    logger.error('Vision API endpoint error:', error?.message || error);
    
    // Ensure always return valid JSON
    const errorResponse = {
      error: 'Vision API error',
      message: error?.message || 'Unknown error occurred',
      timestamp: new Date().toISOString(),
    };
    
    // Add stack trace only in development
    if (process.env.NODE_ENV === 'development') {
      (errorResponse as any).stack = error?.stack;
    }
    
    return res.status(500).json(errorResponse);
  }
}
