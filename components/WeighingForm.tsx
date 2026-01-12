
import React, { useState, useEffect, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { saveRecord, predictData, getKnowledgeBase, getLastRecordBySupplier } from '../services/storageService';
import { trackEvent } from '../services/analyticsService';
import { useTranslation } from '../services/i18n';
import { useToast } from './Toast';
import { callGeminiAPI, analyzeImageWithGemini } from '../services/geminiService';
import { analyzeImageWithVision } from '../services/visionService';
import { logger } from '../services/logger';

// Use stable model for reliable production vision
const TOLERANCE_KG = 0.2;

// Helper: Parse multiple weights separated by commas
const parseGrossWeightInput = (input: string): { total: number; details?: number[] } => {
    if (!input.trim()) return { total: 0 };
    
    // Check if input contains commas (multiple values)
    if (input.includes(',')) {
        const parts = input.split(',').map(s => parseFloat(s.trim()));
        const validParts = parts.filter(v => !isNaN(v) && v > 0);
        
        if (validParts.length > 0) {
            const total = parseFloat(validParts.reduce((a, b) => a + b, 0).toFixed(2));
            return { total, details: validParts };
        }
    }
    
    // Single value
    const single = parseFloat(input);
    if (!isNaN(single) && single > 0) {
        return { total: single };
    }
    
    return { total: 0 };
};

export const WeighingForm: React.FC = () => {
    const { t, language } = useTranslation();
    const { showToast } = useToast();

    // Form State
    const [supplier, setSupplier] = useState('');
    const [product, setProduct] = useState('');
    const [batch, setBatch] = useState('');
    const [expirationDate, setExpirationDate] = useState('');
    const [productionDate, setProductionDate] = useState('');
    const [temperature, setTemperature] = useState<string>('');
    const [temperatureSuggestion, setTemperatureSuggestion] = useState<number | null>(null);
    const [grossWeight, setGrossWeight] = useState<string>('');
    const [noteWeight, setNoteWeight] = useState<string>('');
    const [evidence, setEvidence] = useState<string | null>(null); // Base64 image
    
    // Collapsible sections
    const [showBoxes, setShowBoxes] = useState(false);
    const [boxQty, setBoxQty] = useState<string>('');
    const [boxTara, setBoxTara] = useState<string>('');
    const [boxQtyEmbalaje, setBoxQtyEmbalaje] = useState<string>('');
    const [boxTaraEmbalaje, setBoxTaraEmbalaje] = useState<string>(''); 
    
    // Refs for auto-focus and file inputs
    const noteInputRef = useRef<HTMLInputElement>(null);
    const grossInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    // Suggestions & AI Context
    const [suggestions, setSuggestions] = useState<{products: string[], suppliers: string[]}>({products: [], suppliers: []});
    const [prediction, setPrediction] = useState<{suggestedProduct?: string; suggestedTaraBox?: number;}>({});
    const [historyContext, setHistoryContext] = useState<string | null>(null);
    const [assistantMessage, setAssistantMessage] = useState("");
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isReadingImage, setIsReadingImage] = useState(false);
    const [aiAlert, setAiAlert] = useState<string | null>(null);

    // Track active sections for styling
    const [activeSection, setActiveSection] = useState<'identity' | 'weights' | 'tara' | 'evidence' | null>(null);

    // Initialize Assistant Message
    useEffect(() => {
        if (!assistantMessage) setAssistantMessage(t('assistant_default'));
    }, [t]);

    // Load Knowledge Base
    useEffect(() => {
        const kb = getKnowledgeBase();
        setSuggestions({ products: kb.products, suppliers: kb.suppliers });
    }, []);

    // Auto-collapse Tara section logic AND extended auto-focus to Gross Weight
    useEffect(() => {
        // Only run if boxes are shown and user has typed a quantity
        if (!showBoxes || !boxQty) return;

        const timer = setTimeout(() => {
            setShowBoxes(false);
            setActiveSection('weights');
            
            // Logic: Jump to Note Weight if empty, otherwise Jump to Gross Weight
            if (!noteWeight) {
                noteInputRef.current?.focus();
            } else {
                grossInputRef.current?.focus();
            }
        }, 1500);

        return () => clearTimeout(timer);
    }, [boxQty, showBoxes, noteWeight]);

    // Auto-focus from Note Weight to Gross Weight (extended behavior)
    useEffect(() => {
        if (!noteWeight || grossWeight) return; // Only if Note is filled but Gross is empty
        
        const timer = setTimeout(() => {
            grossInputRef.current?.focus();
        }, 1200); // Same timing as Tara->Note

        return () => clearTimeout(timer);
    }, [noteWeight, grossWeight]);

    // Reactive Assistant Logic
    useEffect(() => {
        if (supplier) {
            const pred = predictData(supplier, product);
            setPrediction(pred);
            if (product && pred.suggestedTaraBox) setShowBoxes(true);
            
            const lastRecord = getLastRecordBySupplier(supplier);
            if (lastRecord) {
                const diff = lastRecord.netWeight - lastRecord.noteWeight;
                if (Math.abs(diff) > TOLERANCE_KG) {
                    setHistoryContext(`${supplier}: last diff ${diff > 0 ? '+' : ''}${diff.toFixed(2)}kg.`);
                } else {
                    setHistoryContext(`${supplier}: OK.`);
                }
            } else {
                setHistoryContext(null);
            }
        } else {
            setPrediction({});
            setHistoryContext(null);
        }

        updateAssistantVoice();

    }, [supplier, product, grossWeight, noteWeight, boxQty, boxTara, language]);

    const boxTaraKg = Number(boxTara) / 1000;
    const boxTaraEmbalajeKg = Number(boxTaraEmbalaje) / 1000;
    const totalTara = (Number(boxQty) * boxTaraKg) + (Number(boxQtyEmbalaje) * boxTaraEmbalajeKg);
    const grossWeightParsed = parseGrossWeightInput(grossWeight);
    const netWeight = (grossWeightParsed.total || 0) - totalTara;
    const difference = netWeight - (Number(noteWeight) || 0);

    const updateAssistantVoice = () => {
        if (!supplier) {
            setAssistantMessage(t('assistant_supplier'));
            return;
        }
        if (!product) {
            setAssistantMessage(prediction.suggestedProduct 
                ? t('assistant_product', { product: prediction.suggestedProduct }) 
                : t('assistant_product_ask'));
            return;
        }
        if (!noteWeight) {
            setAssistantMessage(t('assistant_note'));
            return;
        }
        if (!grossWeight) {
            setAssistantMessage(t('assistant_gross'));
            return;
        }
        if (Math.abs(difference) <= TOLERANCE_KG) {
            setAssistantMessage(t('assistant_ok'));
        } else {
            const diffVal = Math.abs(difference).toFixed(2);
            setAssistantMessage(difference > 0 
                ? t('assistant_high', { diff: diffVal }) 
                : t('assistant_low', { diff: diffVal }));
        }
    };

    // --- HELPER: Expiration Risk Check ---
    const checkExpirationRisk = (dateStr: string): string | null => {
        if (!dateStr) return null;
        
        // Handle DD/MM/YYYY or DD.MM.YY or DD-MM-YYYY
        const cleanDate = dateStr.replace(/[\.-]/g, '/').trim();
        const parts = cleanDate.split('/');
        
        if (parts.length !== 3) return null;
        
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Months are 0-indexed
        let year = parseInt(parts[2], 10);
        
        // Handle 2 digit year
        if (year < 100) year += 2000; 

        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

        const expDate = new Date(year, month, day);
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return `⚠️ VENCIDO hace ${Math.abs(diffDays)} días`;
        if (diffDays <= 7) return `⚠️ CRÍTICO: Vence en ${diffDays} días`;
        
        return null;
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    // Resize to avoid localStorage quotas
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const scaleSize = MAX_WIDTH / img.width;
                    canvas.width = MAX_WIDTH;
                    canvas.height = img.height * scaleSize;

                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                    
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6); // 60% quality
                    setEvidence(compressedDataUrl);
                    
                    // Trigger AI Analysis
                    analyzeImageContent(compressedDataUrl);
                };
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    };
    
    // OFFLINE OCR LOGIC
    const performOfflineOCR = async (base64Image: string) => {
        setAiAlert(t('btn_analyzing') + " (Modo Offline)");
        try {
            const worker = await createWorker('por'); // Load Portuguese data
            const { data: { text } } = await worker.recognize(base64Image);
            await worker.terminate();

            logger.debug("Offline OCR Text:", text);
            parseOCRText(text);

        } catch (error) {
            logger.error("Offline OCR Error:", error);
            setAiAlert("Error en lectura local.");
        }
    };

    // OCR Interpretation Module (Tesseract offline)
    const ocrInterpret = (text: string): Record<string, any> => {
        // ==================== TEXT PREPROCESSING ====================
        // Remove common OCR noise patterns
        let cleanedText = text
            // Remove common OCR artifacts
            .replace(/[|\/\\=\-\+\*]{3,}/g, ' ') // Remove lines of symbols
            .replace(/[^\w\s\/\.\-,%;]/g, ' ') // Keep only alphanumeric, space, and important symbols
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/(\d)\s+([a-z])/g, '$1$2') // Fix "18 000" -> "18000"
            .toLowerCase();

        const lines = cleanedText.split('\n').map(l => l.trim()).filter(l => {
            // Filter out garbage lines (too short, all digits, or obvious noise)
            if (l.length < 2) return false;
            if (/^\d+$/.test(l)) return false;
            if (/^[!@#$%^&*()]{2,}/.test(l)) return false;
            // Skip lines that are just repetitive characters
            if (/(.)\1{3,}/.test(l)) return false;
            return true;
        });

        const result = {
            product: 'review',
            supplier: 'review',
            batch: 'review',
            manufacturing_date: 'review',
            expiration_date: 'review',
            tare_kg: null,
            gross_weight_kg: null,
            net_weight_kg: null,
            confidence: 0,
        };

        // ==================== DATE DETECTION ====================
        const dateRegex = /(\d{2})[\/\-.](\d{2})[\/\-.](\d{2,4})/g;
        const dateMatches = [...cleanedText.matchAll(dateRegex)].map(m => ({
            raw: m[0],
            day: m[1],
            month: m[2],
            year: m[3].length === 2 ? '20' + m[3] : m[3],
            index: m.index || 0,
        }));

        // Filter out invalid month/day combos
        const validDateMatches = dateMatches.filter(d => {
            const month = parseInt(d.month);
            const day = parseInt(d.day);
            return month >= 1 && month <= 12 && day >= 1 && day <= 31;
        });

        const normalizeDate = (dateObj: any) => `${dateObj.day}/${dateObj.month}/${dateObj.year}`;

        // Production date: look for FAB/PROD keywords first
        const prodKeywordMatch = cleanedText.match(/(fab|fabr|man|prod|fabricacao|data de fab)[\s\.:-]*([\d\/\-\.]{6,10})/);
        if (prodKeywordMatch && validDateMatches.length > 0) {
            const prodMatch = validDateMatches.find(d => prodKeywordMatch[2].includes(d.raw));
            if (prodMatch) result.manufacturing_date = normalizeDate(prodMatch);
            else if (validDateMatches.length > 0) result.manufacturing_date = normalizeDate(validDateMatches[0]);
        } else if (validDateMatches.length > 0) {
            result.manufacturing_date = normalizeDate(validDateMatches[0]);
        }

        // Expiration date: look for VAL/VENC/EXP keywords first
        const expKeywordMatch = cleanedText.match(/(val|venc|exp|validade|vencimento)[\s\.:-]*([\d\/\-\.]{6,10})/);
        if (expKeywordMatch && validDateMatches.length > 0) {
            const expMatch = validDateMatches.find(d => expKeywordMatch[2].includes(d.raw));
            if (expMatch) result.expiration_date = normalizeDate(expMatch);
            else if (validDateMatches.length > 1) result.expiration_date = normalizeDate(validDateMatches[validDateMatches.length - 1]);
        } else if (validDateMatches.length > 1) {
            result.expiration_date = normalizeDate(validDateMatches[validDateMatches.length - 1]);
        }

        // ==================== BATCH / LOT DETECTION ====================
        // Priority 1: Explicit LOT/LOTE/BATCH keywords
        const batchKeywordLine = lines.find(l => /\b(lote|lot|l:|l\.|batch|lote:)\b/i.test(l));
        if (batchKeywordLine) {
            const batchMatch = batchKeywordLine.match(/(lote|lot|l:|l\.|batch|lote:)[\s\.:]?([A-Za-z0-9\-\/]+)/i);
            if (batchMatch && batchMatch[2]) {
                result.batch = batchMatch[2].trim().toUpperCase();
            }
        } else {
            // Priority 2: Find alphanumeric tokens near dates or weights
            for (const l of lines) {
                const token = l.replace(/[^A-Za-z0-9\-\/]/g, '').trim();
                if (/^[A-Z0-9\-]{3,15}$/.test(token) && !/^\d+$/.test(token)) {
                    result.batch = token.toUpperCase();
                    break;
                }
            }
        }

        // ==================== TARE DETECTION ====================
        const taraKeywordLine = lines.find(l => /\b(tara|t:|t\.|emb|packaging|peso vazio|vazio)\b/i.test(l));
        if (taraKeywordLine) {
            const taraMatch = taraKeywordLine.match(/(\d+[\.,]?\d*)\s*(g|kg|ml)?/i);
            if (taraMatch) {
                let taraVal = parseFloat(taraMatch[1].replace(',', '.'));
                const unit = (taraMatch[2] || '').toLowerCase();
                // Normalize to kg
                if (unit === 'g' || (!unit && taraVal > 100)) taraVal = taraVal / 1000;
                if (!isNaN(taraVal) && taraVal > 0 && taraVal < 100) {
                    result.tare_kg = parseFloat(taraVal.toFixed(3));
                }
            }
        } else {
            // Fallback: find smallest reasonable weight (but not too small)
            const weightRegex = /(\d+[\.,]?\d*)\s*(g|kg|ml)?/gi;
            const weights: Array<{val: number, unit: string}> = [];
            for (const match of cleanedText.matchAll(weightRegex)) {
                let val = parseFloat(match[1].replace(',', '.'));
                const unit = (match[2] || '').toLowerCase();
                if (unit === 'g' || (!unit && val > 100)) val = val / 1000;
                if (val > 0.01 && val < 100) weights.push({val, unit: unit || 'kg'});
            }
            // Find smallest weight (most likely tara)
            if (weights.length > 1) {
                const smallest = weights.reduce((a, b) => a.val < b.val ? a : b);
                if (smallest.val > 0.1 && smallest.val < 20) {
                    result.tare_kg = parseFloat(smallest.val.toFixed(3));
                }
            }
        }

        // ==================== GROSS & NET WEIGHT DETECTION ====================
        const bruteMatch = cleanedText.match(/(peso bruto|bruto|gross)[\s\.:-]*([\d,\.]+)\s*(kg|g)?/i);
        if (bruteMatch) {
            let val = parseFloat(bruteMatch[2].replace(',', '.'));
            const unit = (bruteMatch[3] || '').toLowerCase();
            if (unit === 'g' || (!unit && val > 100)) val = val / 1000;
            if (val > 0 && val < 500) result.gross_weight_kg = parseFloat(val.toFixed(3));
        }

        const netMatch = cleanedText.match(/(peso liquido|liquido|net|peso net)[\s\.:-]*([\d,\.]+)\s*(kg|g)?/i);
        if (netMatch) {
            let val = parseFloat(netMatch[2].replace(',', '.'));
            const unit = (netMatch[3] || '').toLowerCase();
            if (unit === 'g' || (!unit && val > 100)) val = val / 1000;
            if (val > 0 && val < 500) result.net_weight_kg = parseFloat(val.toFixed(3));
        }

        // ==================== SUPPLIER DETECTION ====================
        // Priority 1: Explicit keywords
        const supplierKeywordLine = lines.find(l => /\b(marca|fornecedor|supplier|brand|fabricante|made by|de|s\.a\.|s\.a|ltda|cia|inc)\b/i.test(l));
        if (supplierKeywordLine) {
            const cleaned = supplierKeywordLine.replace(/[^\w\s]/g, '').trim();
            if (cleaned.length > 2) result.supplier = cleaned;
        } else if (lines.length > 0) {
            // Priority 2: First good candidate line (not numeric, not label keyword)
            const labelKeywords = /\b(lote|val|venc|validade|fab|prod|peso|kg|g|tara|codigo|cod|ingredientes|emb|packaging|data|date|liquido|bruto)\b/i;
            for (const l of lines) {
                if (!/^\d+/.test(l) && !labelKeywords.test(l) && l.length > 3 && l.length < 60) {
                    result.supplier = l.trim();
                    break;
                }
            }
        }

        // ==================== PRODUCT DETECTION ====================
        const labelKeywords = /\b(lote|val|venc|validade|fab|prod|peso|kg|g|tara|codigo|cod|ingredientes|ingrediente|emb|packaging|data|date|liquido|bruto|ml|l|g|peito)\b/i;
        let bestProduct = 'review';
        let bestScore = -999;

        for (const l of lines) {
            // Skip lines with label keywords or that are too similar to supplier
            if (labelKeywords.test(l)) continue;
            if (result.supplier !== 'review' && l.trim().toLowerCase() === result.supplier.toLowerCase()) continue;
            // Skip very short lines
            if (l.length < 3) continue;
            // Skip lines with only numbers or mostly numbers
            if (/^\d+$/.test(l) || /^\d[\d\s]+\d$/.test(l)) continue;
            // Skip single letters
            if (/^[a-z]$/i.test(l)) continue;

            // Score: word count + length, penalize digits
            const words = l.split(/\s+/).length;
            const digitCount = (l.match(/\d/g) || []).length;
            const score = words * 3.5 + Math.min(25, l.length / 2.5) - digitCount * 1.2;

            if (score > bestScore) {
                bestProduct = l.trim();
                bestScore = score;
            }
        }

        if (bestProduct !== 'review') {
            result.product = bestProduct;
        }

        // ==================== CONFIDENCE SCORING ====================
        let confidence = 0;
        if (result.product !== 'review') confidence += 25;
        if (result.supplier !== 'review') confidence += 20;
        if (result.batch !== 'review') confidence += 15;
        if (result.manufacturing_date !== 'review') confidence += 15;
        if (result.expiration_date !== 'review') confidence += 15;
        if (result.tare_kg !== null) confidence += 10;
        if (result.gross_weight_kg !== null) confidence += 5;
        if (result.net_weight_kg !== null) confidence += 5;

        // Boost confidence if multiple weights detected (likely reliable)
        const weightsDetected = [result.tare_kg, result.gross_weight_kg, result.net_weight_kg].filter(w => w !== null).length;
        if (weightsDetected >= 2) confidence += 10;

        result.confidence = Math.min(100, confidence);

        return result;
    };

    const parseOCRText = (text: string) => {
        const ocrData = ocrInterpret(text);
        let foundData = false;
        let foundExpiration = '';

        logger.debug("OCR Interpretation Result:", ocrData);

        // ==================== APPLY EXTRACTED DATA ====================

        // Product
        if (ocrData.product !== 'review' && !product) {
            setProduct(ocrData.product);
            foundData = true;
        }

        // Supplier
        if (ocrData.supplier !== 'review' && !supplier) {
            setSupplier(ocrData.supplier);
            foundData = true;
        }

        // Batch
        if (ocrData.batch !== 'review' && !batch) {
            setBatch(ocrData.batch);
            foundData = true;
        }

        // Manufacturing Date
        if (ocrData.manufacturing_date !== 'review' && !productionDate) {
            setProductionDate(ocrData.manufacturing_date);
            foundData = true;
        }

        // Expiration Date
        if (ocrData.expiration_date !== 'review' && !expirationDate) {
            foundExpiration = ocrData.expiration_date;
            setExpirationDate(ocrData.expiration_date);
            foundData = true;
        }

        // Tare Weight
        if (ocrData.tare_kg !== null && !boxTara) {
            const taraGrams = Math.round(ocrData.tare_kg * 1000);
            setBoxTara(taraGrams.toString());
            setShowBoxes(true);
            foundData = true;
        }

        // ==================== FEEDBACK MESSAGE ====================
        if (foundData) {
            const riskMsg = checkExpirationRisk(foundExpiration);
            const confidenceMsg = ocrData.confidence >= 75 ? "✅ Muy confiable" : ocrData.confidence >= 50 ? "⚠️ Revisar" : "❓ Baja confianza";
            setAiAlert(`${confidenceMsg} (OCR: ${ocrData.confidence}%). ${riskMsg ? riskMsg + ". " : ""}Datos offline detectados.`);
        } else {
            setAiAlert("⚠️ No se detectaron datos claros. Copie manualmente.");
        }
    };

    const analyzeImageContent = async (base64Image: string) => {
        setIsReadingImage(true);
        setAiAlert(null);
        
        const base64 = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
        
        // 1. Try Google Vision API first (most reliable for OCR)
        try {
            logger.debug('Attempting Google Vision API...');
            const visionText = await analyzeImageWithVision(base64);
            if (visionText) {
                logger.debug('Vision API Text:', visionText);
                parseOCRText(visionText);
                setIsReadingImage(false);
                return;
            }
        } catch (visionError) {
            console.warn('Vision API failed:', visionError);
        }
        
        // 2. Try Gemini (with rotation) if Vision didn't work
        try {
            logger.debug('Attempting Gemini API...');
            const prompt = `
            Analyze this image of a product label.
            
            Tasks:
            1. Identify Product Name: This is usually the BIGGEST text (e.g., "ASA RESF", "Cebola", "Tomate"). It describes WHAT the item is.
            2. Identify Supplier/Brand: This is usually a logo or smaller text (e.g., "Seara", "Friboi", "AgroX").
            3. Dates: Find Expiration (Validade/Venc) and Production (Fab/Prod).
            4. Batch: Find "Lote" or "L:".
            5. Tara: Find packaging weight.

            Strictly distinguish Product from Supplier. If you see "ASA RESF", that is likely the Product (Asa Resfriada), not the Supplier.
            
            Respond in JSON format only: { 
                "supplier": string,
                "product": string,
                "expiration": string, 
                "production": string, 
                "batch": string, 
                "tara": number | null
            }.
            `;

            const text = await analyzeImageWithGemini(base64, prompt);
            if (text) {
                logger.debug("Gemini Raw Response:", text);
                let jsonString = text.replace(/```json/g, '').replace(/```/g, '').trim();
                const firstBrace = jsonString.indexOf('{');
                const lastBrace = jsonString.lastIndexOf('}');
                
                if (firstBrace !== -1 && lastBrace !== -1) {
                    jsonString = jsonString.substring(firstBrace, lastBrace + 1);
                }

                try {
                    const data = JSON.parse(jsonString);
                    
                    if (data.supplier && !supplier) setSupplier(data.supplier);
                    if (data.product && !product) setProduct(data.product);
                    if (data.batch && !batch) setBatch(data.batch);
                    if (data.expiration && !expirationDate) setExpirationDate(data.expiration);
                    if (data.production && !productionDate) setProductionDate(data.production);
                    
                    let normalizedTara: number | null = null;
                    if (data.tara) {
                        let val = Number(data.tara);
                        if (val < 10) val = val * 1000;
                        normalizedTara = Math.round(val);
                    }

                    if (normalizedTara !== null && !boxTara) {
                        setBoxTara(normalizedTara.toString());
                        setShowBoxes(true);
                    }

                    const parts = [];
                    if (data.product) parts.push(`${t('ph_product')} ${data.product}`);
                    if (data.supplier) parts.push(`${t('ph_supplier')} ${data.supplier}`);
                    if (data.batch) parts.push(`${t('ph_batch').toLowerCase()} ${data.batch}`);
                    if (data.production) parts.push(`${t('ph_production').toLowerCase()} ${data.production}`);
                    if (data.expiration) parts.push(`${t('ph_expiration').toLowerCase()} ${data.expiration}`);
                    if (normalizedTara !== null) parts.push(`tara ${normalizedTara}g`);

                    const riskMsg = data.expiration ? checkExpirationRisk(data.expiration) : null;
                    
                    if (riskMsg) {
                        setAiAlert(riskMsg);
                    } else if (parts.length > 0) {
                        setAiAlert(`📷 ${parts.join(', ')}.`);
                    }

                    setIsReadingImage(false);
                    return;

                } catch (parseError) {
                    console.warn('Gemini JSON parse failed, trying Offline OCR:', parseError);
                }
            }
        } catch (geminiError: any) {
            console.warn('Gemini failed, attempting Offline OCR...', geminiError);
            if (geminiError?.message && /quota|rate limit|429|exceeded/i.test(geminiError.message)) {
                setAiAlert("Error de cuota en APIs remotas. Usando OCR local...");
            }
        }
        
        // 3. Fallback to Offline OCR
        try {
            logger.debug('Attempting Offline OCR (fallback)...');
            await performOfflineOCR(base64Image);
        } catch (ocrError) {
            logger.error('Offline OCR error:', ocrError);
            setAiAlert("Error en lectura local. Ingresa datos manualmente.");
        } finally {
            setIsReadingImage(false);
        }
    };

    const getStatusColor = () => {
        if (!grossWeight || !noteWeight) return 'from-slate-700 to-slate-900 dark:from-slate-800 dark:to-black text-white';
        if (Math.abs(difference) <= TOLERANCE_KG) return 'from-emerald-500 to-teal-500 dark:from-emerald-600 dark:to-teal-700 text-white shadow-lg shadow-emerald-500/20';
        return 'from-orange-500 to-red-500 dark:from-orange-600 dark:to-red-700 text-white shadow-lg shadow-red-500/20';
    };

    const handleSave = () => {
        if (!supplier || !product || !grossWeight || !noteWeight) {
            showToast(t('msg_validation_error'), 'error');
            return;
        }

        saveRecord({
            id: Date.now().toString(),
            timestamp: Date.now(),
            supplier,
            product,
            batch: batch || undefined,
            expirationDate: expirationDate || undefined,
            productionDate: productionDate || undefined,
            temperature: temperature ? Number(temperature) : undefined,
            temperatureSuggestion,
            grossWeight: grossWeightParsed.total,
            noteWeight: Number(noteWeight),
            netWeight,
            taraTotal: totalTara,
            boxes: { qty: Number(boxQty), unitTara: boxTaraKg },
            taraEmbalaje: { qty: Number(boxQtyEmbalaje), unitTara: boxTaraEmbalajeKg },
            grossWeightDetails: grossWeightParsed.details,
            status: Math.abs(difference) > TOLERANCE_KG ? 'error' : 'verified',
            aiAnalysis: aiAlert || undefined,
            evidence: evidence || undefined
        });

        // Trigger a fresh reset without confirmation after saving
        setSupplier('');
        setProduct('');
        setBatch('');
        setExpirationDate('');
        setProductionDate('');
        setTemperature('');
        setTemperatureSuggestion(null);
        setGrossWeight('');
        setNoteWeight('');
        setBoxQty('');
        setBoxTara('');
        setBoxQtyEmbalaje('');
        setBoxTaraEmbalaje('');
        setEvidence(null);
        setAiAlert(null);
        trackEvent('weighing_saved', { netWeight });
        
        const kb = getKnowledgeBase();
        setSuggestions({ products: kb.products, suppliers: kb.suppliers });
        showToast(t('alert_saved'), 'success');
    };

    const analyzeWithAI = async () => {
        setIsAnalyzing(true);
        try {
            const prompt = `
            Act as a strict logistics supervisor.
            Context: User Language is ${t('ai_prompt_lang')}. ANSWER ONLY IN ${t('ai_prompt_lang')}.
            
            Information:
            - Supplier: ${supplier}
            - Product: ${product}
            - Batch: ${batch || 'N/A'}
            - Production Date: ${productionDate || 'N/A'}
            - Expiration Date Found: ${expirationDate || 'N/A'}
            - Current Date: ${new Date().toLocaleDateString()}
            - Invoice Weight: ${noteWeight}, Net Weight: ${netWeight}, Diff: ${difference.toFixed(2)}
            - History context: ${historyContext || 'No data'}
            
            Tasks:
            1. Check weight tolerance (+/- 200g).
            2. CRITICAL: Analyze the Expiration Date relative to Current Date for the specific product '${product}'. 
               If the date is too short (risk of expiring soon on shelf), start response with '⚠️ DATA CURTA' or '⚠️ VENCIMIENTO CORTO'.
            
            Output:
            Give a short, direct action instruction (max 15 words) in ${t('ai_prompt_lang')}.
            `;
            
            const result = await callGeminiAPI(prompt);
            setAiAlert(result?.trim() || "Revisado.");
        } catch (e) {
            setAiAlert("Offline.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const suggestTemperature = async () => {
        if (!product) {
            showToast('Ingresa producto primero', 'info');
            return;
        }

        setIsAnalyzing(true);
        try {
            const month = new Date().getMonth() + 1;
            const season = month >= 3 && month <= 8 ? 'verano (cálido)' : 'invierno (frío)';
            
            const prompt = `Eres experto en almacenamiento y logística de productos alimentarios.
            
Producto: ${product}
Proveedor: ${supplier || 'N/A'}
Temporada actual: ${season}
Fecha de vencimiento: ${expirationDate || 'N/A'}

Sugiere UNA temperatura óptima (en °C) para almacenar este producto, considerando:
- Tipo de producto
- Temporada/clima
- Regulaciones internacionales

RESPONDE SOLO UN NÚMERO (ej: 18 o 12), sin explicación.`;

            const result = await callGeminiAPI(prompt);
            const temp = parseInt(result?.trim() || '0');
            
            if (temp > 0 && temp < 50) {
                setTemperatureSuggestion(temp);
                setTemperature(temp.toString());
                showToast(`Temperatura sugerida: ${temp}°C`, 'success');
            } else {
                setTemperatureSuggestion(null);
                showToast('No se pudo sugerir temperatura', 'error');
            }
        } catch (e) {
            logger.error('Temperature suggestion error:', e);
            showToast('Error al sugerir temperatura', 'error');
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Helper to determine style based on active section
    const getSectionStyle = (section: 'identity' | 'weights' | 'tara' | 'evidence') => {
        const isActive = activeSection === section;
        const hasData = section === 'identity' ? (supplier || product) : 
                        section === 'weights' ? (grossWeight || noteWeight) : 
                        section === 'evidence' ? !!evidence :
                        (showBoxes || prediction.suggestedTaraBox);
                        
        if (isActive || hasData) {
            return 'bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 border-primary-100 dark:border-transparent ring-4 ring-primary-50/50 dark:ring-primary-900/10 shadow-lg';
        }
        return 'bg-slate-50 dark:bg-slate-900/40 border-transparent';
    };

    return (
        <div className="pb-32 pt-2 space-y-5">
            
            {/* 🤖 Dynamic AI Assistant Bubble */}
            <div className={`p-6 rounded-[2.5rem] shadow-xl transition-all duration-500 bg-gradient-to-br ${getStatusColor()} relative overflow-hidden group`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full -ml-8 -mb-8 blur-xl"></div>

                <div className="relative z-10">
                    <div className="flex items-start gap-4 mb-5">
                         <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
                            <span className="material-icons-round text-2xl pointer-events-none text-white">smart_toy</span>
                         </div>
                         <div className="flex-1">
                             <div className="bg-white/10 backdrop-blur-sm rounded-2xl rounded-tl-none p-3 border border-white/10">
                                 <p className="text-sm font-medium opacity-95 leading-snug text-white">
                                    {isReadingImage ? (
                                        <span className="animate-pulse">{t('lbl_analyzing_img')}</span>
                                    ) : (
                                        aiAlert || assistantMessage
                                    )}
                                 </p>
                             </div>
                             {historyContext && !aiAlert && !isReadingImage && (
                                 <p className="text-[10px] mt-2 opacity-75 flex items-center gap-1 bg-black/20 px-3 py-1 rounded-full w-fit text-white backdrop-blur-sm">
                                    <span className="material-icons-round text-[12px] pointer-events-none">history</span>
                                    {historyContext}
                                 </p>
                             )}
                         </div>
                    </div>

                    <div className="flex justify-between items-end border-t border-white/10 pt-4">
                        <div className="text-white">
                            <span className="text-[10px] uppercase tracking-widest opacity-70 font-bold mb-1 block">Líquido</span>
                            <div className="text-4xl font-black tracking-tighter font-mono leading-none">
                                {netWeight.toFixed(2)}<span className="text-lg opacity-60 ml-1 font-sans font-bold">kg</span>
                            </div>
                        </div>
                        <div className="text-right text-white">
                            <span className="text-[10px] uppercase tracking-widest opacity-70 font-bold mb-1 block">Diferencia</span>
                            <div className={`text-2xl font-bold font-mono bg-white/10 px-3 py-1 rounded-xl backdrop-blur-sm inline-block ${Math.abs(difference) > TOLERANCE_KG ? 'animate-pulse' : ''}`}>
                                {difference > 0 ? '+' : ''}{difference.toFixed(2)}
                            </div>
                        </div>
                    </div>

                    {!aiAlert && Math.abs(difference) > TOLERANCE_KG && (
                         <button 
                            onClick={analyzeWithAI} 
                            disabled={isAnalyzing} 
                            className="mt-4 w-full py-3 bg-white hover:bg-slate-50 text-slate-800 rounded-2xl text-xs font-bold shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                             {isAnalyzing ? <span className="animate-spin material-icons-round text-sm pointer-events-none">refresh</span> : <span className="material-icons-round text-sm pointer-events-none">analytics</span>}
                             {isAnalyzing ? t('btn_analyzing') : t('btn_consult_ai')}
                         </button>
                     )}
                </div>
            </div>

            {/* 1. Evidence Section (Compact & Optimized) */}
            <div 
                className={`rounded-[2rem] border transition-all duration-300 overflow-hidden ${getSectionStyle('evidence')}`}
                onClick={() => setActiveSection('evidence')}
            >
                {!evidence ? (
                    <div className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                                <span className="material-icons-round text-xl pointer-events-none">qr_code_scanner</span>
                            </div>
                            <span className="font-bold text-slate-700 dark:text-slate-200 text-sm leading-tight">{t('lbl_evidence_section')}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                                className="bg-slate-800 dark:bg-white text-white dark:text-slate-900 px-4 py-3 rounded-full text-xs font-bold shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                            >
                                <span className="material-icons-round text-sm pointer-events-none">photo_camera</span>
                                {t('btn_camera')}
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); galleryInputRef.current?.click(); }}
                                className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 w-10 h-10 rounded-full flex items-center justify-center border border-slate-200 dark:border-transparent hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-95 transition-all"
                            >
                                <span className="material-icons-round text-lg pointer-events-none">image</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-2">
                         <div className="relative rounded-[1.5rem] overflow-hidden h-32 group">
                             <img src={evidence} alt="Evidence" className="w-full h-full object-cover" />
                             <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end justify-between p-4">
                                <div className="flex items-center gap-2 text-white">
                                    <div className="bg-green-500 rounded-full p-1">
                                        <span className="material-icons-round text-white text-xs pointer-events-none block">check</span>
                                    </div>
                                    <span className="text-xs font-bold shadow-black drop-shadow-md">{t('lbl_photo_attached')}</span>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setEvidence(null); setAiAlert(null); setBatch(''); setExpirationDate(''); setProductionDate(''); }}
                                    className="bg-white/20 hover:bg-white/40 text-white p-2 rounded-full backdrop-blur-md transition-colors border border-white/20"
                                >
                                    <span className="material-icons-round text-lg pointer-events-none">delete</span>
                                </button>
                             </div>
                         </div>
                    </div>
                )}
                
                {/* Hidden Inputs */}
                <input 
                    ref={cameraInputRef}
                    type="file" 
                    accept="image/*"
                    capture="environment" // Forces camera on mobile
                    className="hidden"
                    onChange={handleImageUpload}
                />
                <input 
                    ref={galleryInputRef}
                    type="file" 
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                />
            </div>

            {/* 2. Identity Section */}
            <div 
                className={`rounded-[2.5rem] border transition-all duration-300 overflow-hidden ${getSectionStyle('identity')}`}
                onFocus={() => setActiveSection('identity')}
            >
                <div className="p-6 space-y-5">
                    <div className="flex items-center gap-3 mb-2 opacity-60 dark:opacity-80 text-slate-500 dark:text-slate-400">
                        <span className="material-icons-round pointer-events-none">store</span>
                        <span className="text-xs font-bold uppercase tracking-wider">{t('lbl_identity')}</span>
                    </div>

                    <div className="space-y-4">
                         <div className="relative">
                            <input 
                                list="suppliers"
                                type="text" 
                                value={supplier}
                                onChange={e => setSupplier(e.target.value)}
                                placeholder={t('ph_supplier')}
                                className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-transparent rounded-2xl px-5 py-4 text-slate-800 dark:text-white font-bold text-lg focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/20 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none"
                            />
                            <datalist id="suppliers">{suggestions.suppliers.map(s => <option key={s} value={s} />)}</datalist>
                        </div>

                        {prediction.suggestedProduct && !product && (
                             <button
                                onClick={() => setProduct(prediction.suggestedProduct!)}
                                className="w-full animate-fade-in text-left px-5 py-4 bg-gradient-to-r from-primary-50 to-white dark:from-slate-800 dark:to-slate-800 border border-primary-100 dark:border-transparent rounded-3xl flex items-center justify-between group hover:shadow-md transition-all"
                            >
                                <span className="text-xs text-primary-700 dark:text-primary-300">
                                    {t('btn_suggestion', {supplier})}<br/>
                                    <span className="font-bold text-sm">{prediction.suggestedProduct}</span>
                                </span>
                                <span className="material-icons-round text-primary-400 group-hover:translate-x-1 transition-transform pointer-events-none bg-white dark:bg-slate-900 rounded-full p-1">add</span>
                            </button>
                        )}

                        <div className="relative">
                            <input 
                                list="products"
                                type="text" 
                                value={product}
                                onChange={e => setProduct(e.target.value)}
                                placeholder={t('ph_product')}
                                className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-transparent rounded-2xl px-5 py-4 text-slate-800 dark:text-white font-bold text-lg focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/20 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none"
                            />
                            <datalist id="products">{suggestions.products.map(p => <option key={p} value={p} />)}</datalist>
                        </div>

                        <div className="flex items-center gap-3 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-transparent rounded-2xl px-4 py-3 focus-within:ring-4 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/20 transition-all">
                            <span className="material-icons-round text-slate-400 dark:text-slate-500 text-xl pointer-events-none">qr_code_2</span>
                            <input 
                                type="text" 
                                value={batch}
                                onChange={e => setBatch(e.target.value)}
                                placeholder={t('ph_batch')}
                                className="w-full bg-transparent text-slate-800 dark:text-white font-bold text-base outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-transparent rounded-2xl px-3 py-3 focus-within:ring-4 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/20 transition-all">
                                <span className="material-icons-round text-slate-400 dark:text-slate-500 text-lg pointer-events-none">factory</span>
                                <input 
                                    type="text" 
                                    value={productionDate}
                                    onChange={e => setProductionDate(e.target.value)}
                                    placeholder={t('ph_production')}
                                    className="w-full bg-transparent text-slate-800 dark:text-white font-bold text-sm outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                />
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-transparent rounded-2xl px-3 py-3 focus-within:ring-4 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/20 transition-all">
                                <span className="material-icons-round text-slate-400 dark:text-slate-500 text-lg pointer-events-none">event_busy</span>
                                <input 
                                    type="text" 
                                    value={expirationDate}
                                    onChange={e => setExpirationDate(e.target.value)}
                                    placeholder={t('ph_expiration')}
                                    className="w-full bg-transparent text-slate-800 dark:text-white font-bold text-sm outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-transparent rounded-2xl px-3 py-3 focus-within:ring-4 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/20 transition-all group">
                            <span className="material-icons-round text-slate-400 dark:text-slate-500 text-lg pointer-events-none">thermostat</span>
                            <input 
                                type="number" 
                                value={temperature}
                                onChange={e => setTemperature(e.target.value)}
                                placeholder="Temperatura (°C)"
                                min="0"
                                max="50"
                                className="w-full bg-transparent text-slate-800 dark:text-white font-bold text-base outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                            />
                            <span className="text-slate-400 dark:text-slate-500 font-bold text-sm">°C</span>
                            <button
                                type="button"
                                onClick={suggestTemperature}
                                disabled={isAnalyzing || !product}
                                className={`p-1.5 rounded-lg transition-all ${temperatureSuggestion ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-300' : 'hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 dark:text-slate-500'}`}
                                title="Sugerir temperatura con IA"
                            >
                                <span className="material-icons-round text-base pointer-events-none">auto_awesome</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Weights Section */}
            <div 
                className={`rounded-[2.5rem] border transition-all duration-300 overflow-hidden ${getSectionStyle('weights')}`}
                onFocus={() => setActiveSection('weights')}
            >
                <div className="p-6">
                     <div className="flex items-center gap-3 mb-5 opacity-60 dark:opacity-80 text-slate-500 dark:text-slate-400">
                        <span className="material-icons-round pointer-events-none">scale</span>
                        <span className="text-xs font-bold uppercase tracking-wider">{t('lbl_weighing')}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-100 dark:bg-black/20 rounded-3xl p-5 border border-slate-200 dark:border-transparent focus-within:ring-4 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/20 transition-all">
                            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">{t('lbl_note_weight')}</label>
                            <div className="flex items-baseline gap-1">
                                <input 
                                    ref={noteInputRef}
                                    type="number" 
                                    value={noteWeight}
                                    onChange={e => setNoteWeight(e.target.value)}
                                    className="w-full bg-transparent text-3xl font-black text-slate-800 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700 font-mono tracking-tight"
                                    placeholder="0"
                                />
                                <span className="text-sm text-slate-400 dark:text-slate-600 font-bold">kg</span>
                            </div>
                        </div>
                        <div className="bg-slate-100 dark:bg-black/20 rounded-3xl p-5 border border-slate-200 dark:border-transparent focus-within:ring-4 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/20 transition-all">
                            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">{t('lbl_gross_weight')}</label>
                             <div className="flex items-baseline gap-1">
                                <input 
                                    ref={grossInputRef}
                                    type="text" 
                                    value={grossWeight}
                                    onChange={e => setGrossWeight(e.target.value)}
                                    onFocus={() => {
                                        setActiveSection('weights');
                                        setShowBoxes(false); // Auto-collapse tara when moving to gross weight
                                    }}
                                    className="w-full bg-transparent text-3xl font-black text-slate-800 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700 font-mono tracking-tight"
                                    placeholder="0 o 50, 52, 49"
                                />
                                <span className="text-sm text-slate-400 dark:text-slate-600 font-bold">kg</span>
                            </div>
                            {grossWeight.includes(',') && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    Total: {parseGrossWeightInput(grossWeight).total} kg
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. Tara Section */}
            <div 
                className={`rounded-[2.5rem] border transition-all duration-300 overflow-hidden ${getSectionStyle('tara')}`}
                onClick={() => setActiveSection('tara')}
            >
                 <button 
                    onClick={() => setShowBoxes(!showBoxes)}
                    className="w-full flex items-center justify-between p-6"
                    type="button"
                >
                    <div className="flex items-center gap-4">
                         <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${prediction.suggestedTaraBox ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-400'}`}>
                            <span className="material-icons-round text-xl pointer-events-none">inventory_2</span>
                         </div>
                         <div className="text-left">
                             <span className="font-bold text-slate-700 dark:text-white text-base block mb-0.5">{t('lbl_tara_section')}</span>
                             {prediction.suggestedTaraBox && !showBoxes && (
                                 <span className="text-[10px] bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full font-bold">{t('lbl_ai_pattern')}</span>
                             )}
                         </div>
                    </div>
                    
                    {!showBoxes && (Number(boxQty) > 0 || Number(boxTara) > 0) ? (
                        <div className="flex items-center gap-2">
                             {Number(boxQty) > 0 && (
                                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-full border border-slate-200 dark:border-transparent">
                                    <span className="material-icons-round text-[10px] text-slate-500 dark:text-slate-400 pointer-events-none">layers</span>
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-200">{boxQty}</span>
                                </div>
                             )}
                             <span className="font-mono text-sm font-bold bg-slate-800 dark:bg-white text-white dark:text-slate-900 px-3 py-1.5 rounded-full shadow-md">
                                {totalTara.toFixed(1)}kg
                             </span>
                        </div>
                    ) : (
                         <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 transition-transform ${showBoxes ? 'rotate-180 bg-slate-200 dark:bg-slate-700' : ''}`}>
                            <span className="material-icons-round text-slate-400 dark:text-slate-400 pointer-events-none">expand_more</span>
                         </div>
                    )}
                </button>

                {showBoxes && (
                    <div className="px-6 pb-6 animate-fade-in space-y-4">
                        {prediction.suggestedTaraBox !== undefined && (
                            <button
                                onClick={() => setBoxTara((prediction.suggestedTaraBox! * 1000).toString())}
                                className="w-full py-4 bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 rounded-3xl text-sm font-bold border border-primary-100 dark:border-primary-500/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                                type="button"
                            >
                                <span className="material-icons-round text-lg pointer-events-none">auto_fix_normal</span>
                                {t('btn_apply_tara', { supplier, weight: (prediction.suggestedTaraBox * 1000).toFixed(0) })}
                            </button>
                        )}
                        
                        {/* Cajas (Left Column) */}
                        <div className="space-y-3 pb-4 border-b border-slate-200 dark:border-slate-700/50">
                            <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center gap-2">
                                <span className="material-icons-round text-sm">inventory_2</span>
                                Cajas
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 dark:bg-black/20 rounded-3xl p-4 border border-slate-100 dark:border-transparent">
                                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-2 block text-center">{t('lbl_unit_weight')}</label>
                                    <input 
                                        type="number" 
                                        value={boxTara} 
                                        onChange={e => setBoxTara(e.target.value)} 
                                        className="w-full bg-white dark:bg-slate-800 border-none rounded-2xl px-3 py-3 text-lg focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/20 outline-none transition-all font-mono font-bold text-center text-slate-800 dark:text-white shadow-sm" 
                                        placeholder="0" 
                                    />
                                </div>
                                <div className="bg-slate-50 dark:bg-black/20 rounded-3xl p-4 border border-slate-100 dark:border-transparent">
                                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-2 block text-center">{t('lbl_qty')}</label>
                                    <input 
                                        type="number" 
                                        value={boxQty} 
                                        onChange={e => setBoxQty(e.target.value)} 
                                        className="w-full bg-white dark:bg-slate-800 border-none rounded-2xl px-3 py-3 text-lg focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/20 outline-none transition-all font-mono font-bold text-center text-slate-800 dark:text-white shadow-sm" 
                                        placeholder="0" 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Embalajes (Right Column) */}
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center gap-2">
                                <span className="material-icons-round text-sm">layers</span>
                                Embalajes
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 dark:bg-black/20 rounded-3xl p-4 border border-slate-100 dark:border-transparent">
                                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-2 block text-center">{t('lbl_unit_weight')}</label>
                                    <input 
                                        type="number" 
                                        value={boxTaraEmbalaje} 
                                        onChange={e => setBoxTaraEmbalaje(e.target.value)} 
                                        className="w-full bg-white dark:bg-slate-800 border-none rounded-2xl px-3 py-3 text-lg focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/20 outline-none transition-all font-mono font-bold text-center text-slate-800 dark:text-white shadow-sm" 
                                        placeholder="0" 
                                    />
                                </div>
                                <div className="bg-slate-50 dark:bg-black/20 rounded-3xl p-4 border border-slate-100 dark:border-transparent">
                                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-2 block text-center">{t('lbl_qty')}</label>
                                    <input 
                                        type="number" 
                                        value={boxQtyEmbalaje} 
                                        onChange={e => setBoxQtyEmbalaje(e.target.value)} 
                                        className="w-full bg-white dark:bg-slate-800 border-none rounded-2xl px-3 py-3 text-lg focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/20 outline-none transition-all font-mono font-bold text-center text-slate-800 dark:text-white shadow-sm" 
                                        placeholder="0" 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 pb-4">
                <button 
                    onClick={handleSave}
                    className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold h-16 rounded-full shadow-xl shadow-slate-900/20 dark:shadow-white/10 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all"
                    type="button"
                >
                    <span className="material-icons-round pointer-events-none text-2xl">save</span>
                    <span className="text-lg pointer-events-none tracking-wide">{t('btn_save')}</span>
                </button>
            </div>
        </div>
    );
};
