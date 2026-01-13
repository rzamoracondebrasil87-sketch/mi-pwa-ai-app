
import React, { useState, useEffect, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { saveRecord, predictData, getKnowledgeBase, getLastRecordBySupplier, getProductType } from '../services/storageService';
import { trackEvent } from '../services/analyticsService';
import { useTranslation } from '../services/i18n';
import { useToast } from './Toast';
import { callGeminiAPI, analyzeImageWithGemini } from '../services/geminiService';
import { storeImageReading, predictFromReadings } from '../services/storageService';
import { analyzeImageWithVision } from '../services/visionService';
import { logger } from '../services/logger';
import { ImageReading } from '../types';

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
    const boxQtyRef = useRef<HTMLInputElement>(null);
    const boxTaraRef = useRef<HTMLInputElement>(null);
    const boxQtyEmbalajeRef = useRef<HTMLInputElement>(null);
    const boxTaraEmbalajeRef = useRef<HTMLInputElement>(null);
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
    const [extractedPhotoInfo, setExtractedPhotoInfo] = useState<string | null>(null); // Information extracted from photo
    
    // Smart Tips Carousel
    const [smartTips, setSmartTips] = useState<Array<{type: string; title: string; content: string}>>([]);
    const [currentTipIndex, setCurrentTipIndex] = useState(0);
    const [autoRotateTimer, setAutoRotateTimer] = useState<NodeJS.Timeout | null>(null);
    const [touchStartX, setTouchStartX] = useState<number>(0); // Swipe gesture support

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

        // AUTO-PREDICT WEIGHT when supplier+product are set
        if (supplier && product && !grossWeight) {
            const timer = setTimeout(() => {
                analyzeWithAI();
            }, 2000); // 2 second delay to avoid too many API calls

            return () => clearTimeout(timer);
        }

    }, [supplier, product, language]);

    // Update AI Alert when temperature suggestion is set
    useEffect(() => {
        if (temperatureSuggestion && aiAlert && !aiAlert.includes('Temperatura recomendada')) {
            setAiAlert(prev => prev + ` 🌡️ Temperatura recomendada: ${temperatureSuggestion}°C`);
        }
    }, [temperatureSuggestion]);

    const boxTaraKg = Number(boxTara) / 1000;
    const boxTaraEmbalajeKg = Number(boxTaraEmbalaje) / 1000;
    const totalTara = (Number(boxQty) * boxTaraKg) + (Number(boxQtyEmbalaje) * boxTaraEmbalajeKg);
    const grossWeightParsed = parseGrossWeightInput(grossWeight);
    const netWeight = (grossWeightParsed.total || 0) - totalTara;
    const difference = netWeight - (Number(noteWeight) || 0);

    // --- HELPER: Generate Smart Tips (Dynamic Carousel) ---
    const generateSmartTips = () => {
        const tips: Array<{type: string; title: string; content: string}> = [];
        
        // 0. AI ANALYSIS ALERT (Highest Priority - from photo reading)
        if (aiAlert) {
            tips.push({
                type: 'ai_analysis',
                title: t('tip_title_ai_analysis'),
                content: aiAlert
            });
        }
        
        // 1. CRITICAL EXPIRATION ALERTS
        if (expirationDate) {
            const productType = getProductType(supplier, product) || temperature;
            const expAlert = checkExpirationRisk(expirationDate, productType);
            if (expAlert) {
                tips.push({
                    type: 'alert',
                    title: t('tip_title_alert'),
                    content: expAlert
                });
            }
        }
        
        // Weight difference alert
        if (grossWeight && noteWeight && Math.abs(difference) > TOLERANCE_KG) {
            tips.push({
                type: 'alert',
                title: t('tip_title_alert'),
                content: difference > 0 
                    ? `⚠️ SOBRA: ${Math.abs(difference).toFixed(2)}kg`
                    : `⚠️ FALTA: ${Math.abs(difference).toFixed(2)}kg`
            });
        }
        
        // 2. LOGISTICS SUMMARY
        if (batch && noteWeight && grossWeight) {
            tips.push({
                type: 'logistics',
                title: t('tip_title_logistics'),
                content: t('tip_batch_info', { 
                    batch: batch, 
                    mfg: productionDate || '—' 
                }) + ` | ${t('tip_net_calculated', { net: netWeight.toFixed(2) })}`
            });
        } else if (batch || productionDate) {
            tips.push({
                type: 'logistics',
                title: t('tip_title_logistics'),
                content: t('tip_batch_info', { 
                    batch: batch || '—', 
                    mfg: productionDate || '—' 
                })
            });
        }
        
        // 3. STORAGE ADVICE
        if (temperature || product) {
            const prodType = temperature || getProductType(supplier, product);
            if (prodType?.toLowerCase().includes('congel')) {
                tips.push({
                    type: 'storage',
                    title: t('tip_title_storage'),
                    content: t('tip_frozen_store')
                });
            } else if (prodType?.toLowerCase().includes('resfri') || prodType?.toLowerCase().includes('frio')) {
                tips.push({
                    type: 'storage',
                    title: t('tip_title_storage'),
                    content: t('tip_refrigerated_store')
                });
            } else if (prodType?.toLowerCase().includes('fresco')) {
                tips.push({
                    type: 'storage',
                    title: t('tip_title_storage'),
                    content: t('tip_fresh_store')
                });
            }
        }
        
        // 4. ASSISTANT MESSAGE (Fallback)
        if (tips.length === 0) {
            tips.push({
                type: 'assistant',
                title: t('tip_title_assistant'),
                content: assistantMessage
            });
        }
        
        setSmartTips(tips);
        setCurrentTipIndex(0);
    };
    
    // Auto-update Smart Tips when form changes
    useEffect(() => {
        generateSmartTips();
    }, [supplier, product, batch, expirationDate, productionDate, temperature, noteWeight, grossWeight, aiAlert, extractedPhotoInfo, language]);
    
    // Auto-rotate Smart Tips (slower during analysis)
    useEffect(() => {
        if (smartTips.length <= 1) return;
        
        // Clear existing timer
        if (autoRotateTimer) clearTimeout(autoRotateTimer);
        
        // Slower rotation during image analysis
        const rotationSpeed = isAnalyzing || isReadingImage ? 8000 : 5000;
        
        const timer = setTimeout(() => {
            setCurrentTipIndex(prev => (prev + 1) % smartTips.length);
        }, rotationSpeed);
        
        setAutoRotateTimer(timer);
        
        return () => clearTimeout(timer);
    }, [smartTips, currentTipIndex, isAnalyzing, isReadingImage]);

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

    // --- HELPER: Expiration Risk Check (Product Type Aware) ---
    const checkExpirationRisk = (dateStr: string, productType?: string): string | null => {
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

        // Always alert if expired
        if (diffDays < 0) return `⚠️ VENCIDO hace ${Math.abs(diffDays)} días`;

        // Alert strategy based on product type:
        switch (productType?.toLowerCase()) {
            case 'congelado':
                // Frozen products have 1+ year shelf life - only alert if expired
                // Short dates (even 30 days) are normal for frozen goods
                return null;
            
            case 'resfriado':
                // Refrigerated products have short shelf life (7-30 days)
                // Only alert if less than 2 days
                if (diffDays <= 2) return `⚠️ CRÍTICO: Vence en ${diffDays} días`;
                return null;
            
            case 'fresco':
                // Fresh products may have very short life (1-3 days)
                // Alert if less than 1 day
                if (diffDays <= 1) return `⚠️ CRÍTICO: Vence HOY o MAÑANA`;
                return null;
            
            default:
                // Unknown type - use conservative approach
                // Alert if less than 7 days remaining
                if (diffDays <= 7) return `⚠️ PRÓXIMO A VENCER: ${diffDays} días`;
                return null;
        }
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

        // ==================== AUTO-SUGGEST TEMPERATURE (using OCR image data) ====================
        if ((ocrData.product !== 'review' || product) && !temperature) {
            const productName = ocrData.product !== 'review' ? ocrData.product : product;
            const supplierName = ocrData.supplier !== 'review' ? ocrData.supplier : supplier;
            
            // Trigger automatic temperature suggestion based on product + supplier only (NO OCR)
            (async () => {
                try {
                    const month = new Date().getMonth() + 1;
                    const season = month >= 3 && month <= 8 ? 'verano (cálido)' : 'invierno (frío)';
                    
                    const prompt = `Eres experto en almacenamiento y logística de productos alimentarios.

Producto: ${productName}
Proveedor: ${supplierName || 'desconocido'}
Temporada actual: ${season}

Sugiere UNA temperatura óptima (en °C) para almacenar este producto, considerando:
- El tipo de producto
- La temporada/clima actual
- Regulaciones internacionales de almacenamiento

RESPONDE SOLO UN NÚMERO ENTRE 2 Y 25 (ej: 15), sin explicación, sin símbolo °.`;

                    const result = await callGeminiAPI(prompt);
                    const temp = parseInt(result?.trim() || '0');
                    
                    if (temp > 1 && temp < 26) {
                        setTemperatureSuggestion(temp);
                        setTemperature(temp.toString());
                    }
                } catch (e) {
                    logger.debug('Auto temperature suggestion skipped:', e);
                }
            })();
        }

        // ==================== FEEDBACK MESSAGE ====================
        if (foundData) {
            const productType = supplier && product ? getProductType(supplier, product) : undefined;
            const riskMsg = checkExpirationRisk(foundExpiration, productType);
            const confidenceMsg = ocrData.confidence >= 75 ? "✅ Muy confiable" : ocrData.confidence >= 50 ? "⚠️ Revisar" : "❓ Baja confianza";
            
            // Build AI message with temperature info
            let aiMessage = `${confidenceMsg} (OCR: ${ocrData.confidence}%). ${riskMsg ? riskMsg + ". " : ""}Datos offline detectados.`;
            
            // Add temperature suggestion info if available (will be set shortly by async call)
            if (temperatureSuggestion) {
                aiMessage += ` 🌡️ Temperatura recomendada: ${temperatureSuggestion}°C`;
            }
            
            setAiAlert(aiMessage);
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
            const prompt = `ESPECIALISTA EN LECTURA DE ETIQUETAS INDUSTRIALES ALIMENTARIAS

TU ROL: Especialista en lectura de etiquetas de productos alimentarios brasileños (cárnicos, congelados, resfriados).

OBJETIVO: Extraer, validar y estructurar información. NO inferir sin base visible.

REGLAS ABSOLUTAS:
❌ NO inventar datos
❌ NO asumir valores por contexto
❌ NO mezclar Peso Bruto con Peso Líquido
❌ NO confundir fecha de producción con validez
Si un dato no es visible, marcar como "indeterminado"

ORDEN DE LECTURA (obligatorio):
1. Texto impreso en cuadros/tablas
2. Campos con títulos claros
3. Valores numéricos con unidad
4. Sellos oficiales (SIF, MAPA)
5. Marcas/logos
6. Texto secundario

CAMPOS A EXTRAER:
- Produto: nombre exacto visible
- Tipo: congelado, resfriado, fresco
- Fornecedor: marca/proveedor
- Registro SIF: número si existe
- Peso Líquido (kg): valor exacto
- Peso Bruto (kg): valor exacto
- Data de Produção: formato DD/MM/AAAA
- Data de Validade: formato DD/MM/AAAA
- Lote: código exacto (no confundir con código de barras)
- Temperatura en Rótulo: valor visible (ej: "-12°C")

VALIDACIONES ANTES DE RESPONDER:
✓ Peso Bruto ≥ Peso Líquido (si no, marcar ⚠️ posible erro)
✓ Produção < Validade (si no, marcar ⚠️ datas inconsistentes)

NIVEL DE CONFIANZA:
- alta: texto claro y completo
- media: texto parcial legible
- baja: campos importantes dudosos

RESPONDE EN JSON EXACTO (completa todos los campos):
{
  "produto": "string",
  "tipo": "congelado|resfriado|fresco|indeterminado",
  "fornecedor": "string",
  "sif": "string o null",
  "peso_liquido_kg": number o null,
  "peso_bruto_kg": number o null,
  "data_fabricacao": "DD/MM/AAAA o indeterminado",
  "data_validade": "DD/MM/AAAA o indeterminado",
  "lote": "string o indeterminado",
  "temperatura_rotulo": "string (ej: -12°C) o indeterminado",
  "validaciones": "string (notas si hay inconsistencias)",
  "confianza_leitura": "alta|media|baja"
}

Analiza con cuidado, no rápido.`;

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
                    
                    // ==================== ALMACENAR LECTURA PARA APRENDIZAJE ====================
                    const imageReading: ImageReading = {
                        id: `reading_${Date.now()}`,
                        timestamp: Date.now(),
                        supplier: data.fornecedor || supplier || 'desconocido',
                        product: data.produto || product || 'desconocido',
                        imageBase64: base64,
                        extractedData: {
                            product: data.produto,
                            productionDate: data.data_fabricacao !== 'indeterminado' ? data.data_fabricacao : undefined,
                            expirationDate: data.data_validade !== 'indeterminado' ? data.data_validade : undefined,
                            batch: data.lote !== 'indeterminado' ? data.lote : undefined,
                            netWeight: data.peso_liquido_kg,
                            grossWeight: data.peso_bruto_kg,
                            tareWeight: data.peso_bruto_kg && data.peso_liquido_kg ? data.peso_bruto_kg - data.peso_liquido_kg : undefined,
                            temperature: undefined, // Será completado abajo
                            barcode: undefined,
                            type: data.tipo,
                            sif: data.sif
                        },
                        aiPrediction: undefined,
                        userVerified: false,
                        confidence: ['alta', 'media', 'baja'].includes(data.confianza_leitura) 
                            ? (data.confianza_leitura === 'alta' ? 90 : data.confianza_leitura === 'media' ? 60 : 40)
                            : 60
                    };
                    
                    // Map new JSON structure to form fields
                    if (data.fornecedor && !supplier) setSupplier(data.fornecedor);
                    if (data.produto && !product) setProduct(data.produto);
                    if (data.lote && data.lote !== 'indeterminado' && !batch) setBatch(data.lote);
                    if (data.data_validade && data.data_validade !== 'indeterminado' && !expirationDate) setExpirationDate(data.data_validade);
                    if (data.data_fabricacao && data.data_fabricacao !== 'indeterminado' && !productionDate) setProductionDate(data.data_fabricacao);
                    
                    // Handle peso_liquido_kg for tara calculation (if needed)
                    let normalizedTara: number | null = null;
                    if (data.peso_bruto_kg && data.peso_liquido_kg) {
                        const taraDiff = data.peso_bruto_kg - data.peso_liquido_kg;
                        if (taraDiff > 0) {
                            normalizedTara = Math.round(taraDiff * 1000);
                        }
                    }

                    if (normalizedTara !== null && !boxTara) {
                        setBoxTara(normalizedTara.toString());
                        setShowBoxes(true);
                    }

                    // Build extracted photo info (simplified for history)
                    const extractedInfo = [];
                    if (data.produto) extractedInfo.push(`${t('ph_product')}: ${data.produto}`);
                    if (data.fornecedor) extractedInfo.push(`${t('ph_supplier')}: ${data.fornecedor}`);
                    if (data.lote && data.lote !== 'indeterminado') extractedInfo.push(`${t('ph_batch')}: ${data.lote}`);
                    if (data.data_fabricacao && data.data_fabricacao !== 'indeterminado') extractedInfo.push(`${t('ph_production')}: ${data.data_fabricacao}`);
                    if (data.data_validade && data.data_validade !== 'indeterminado') extractedInfo.push(`${t('ph_expiration')}: ${data.data_validade}`);
                    
                    setExtractedPhotoInfo(extractedInfo.join(' | ') || null);

                    // Build AI alert message (for carousel now)
                    const parts = [];
                    if (data.produto) parts.push(`${t('ph_product')} ${data.produto}`);
                    if (data.fornecedor) parts.push(`${t('ph_supplier')} ${data.fornecedor}`);
                    if (data.lote && data.lote !== 'indeterminado') parts.push(`${t('ph_batch').toLowerCase()} ${data.lote}`);
                    if (data.data_fabricacao && data.data_fabricacao !== 'indeterminado') parts.push(`${t('ph_production').toLowerCase()} ${data.data_fabricacao}`);
                    if (data.data_validade && data.data_validade !== 'indeterminado') parts.push(`${t('ph_expiration').toLowerCase()} ${data.data_validade}`);
                    if (data.peso_liquido_kg) parts.push(`${data.peso_liquido_kg}kg neto`);
                    if (data.validaciones) parts.push(`⚠️ ${data.validaciones}`);

                    // Use product type for smart expiration alerts
                    const productType = data.tipo || imageReading.extractedData.type;
                    const riskMsg = data.data_validade && data.data_validade !== 'indeterminado' ? checkExpirationRisk(data.data_validade, productType) : null;
                    
                    if (riskMsg) {
                        setAiAlert(riskMsg);
                    } else if (parts.length > 0) {
                        setAiAlert(`📷 ${parts.join(', ')}. Confianza: ${data.confianza_leitura || 'media'}`);
                    }

                    // ==================== TEMPERATURE FROM LABEL + AI PREDICTION ====================
                    if (!temperature) {
                        try {
                            // First: Check if label has temperature info
                            if (data.temperatura_rotulo && data.temperatura_rotulo !== 'indeterminado') {
                                logger.debug('Temperature from label:', data.temperatura_rotulo);
                                const tempMatch = data.temperatura_rotulo.match(/-?\d+/);
                                if (tempMatch) {
                                    const labelTemp = parseInt(tempMatch[0]);
                                    imageReading.extractedData.temperature = labelTemp;
                                    setTemperatureSuggestion(labelTemp);
                                    setTemperature(labelTemp.toString());
                                }
                            } else {
                                // If no label temp, use Gemini to predict from image
                                const tempPrompt = `Analiza esta imagen de un producto alimentario.

Basándote ÚNICAMENTE en lo que ves (etiqueta, tipo de producto, embalaje, etc.):

1. ¿Qué tipo de producto es? (ej: carne, lácteos, verduras, frutas, etc.)
2. ¿Hay instrucciones de almacenamiento en la etiqueta?
3. ¿Parece ser un producto fresco, refrigerado o congelado?

Sugiere la temperatura óptima (en °C) para almacenar este producto.

RESPONDE SOLO UN NÚMERO ENTRE 0 Y 25 (ej: 15 o 4), sin explicación, sin símbolo °.`;

                                const tempResult = await analyzeImageWithGemini(base64, tempPrompt);
                                if (tempResult) {
                                    const tempValue = parseInt(tempResult?.trim() || '0');
                                    if (tempValue > -1 && tempValue < 26) {
                                        imageReading.extractedData.temperature = tempValue;
                                        imageReading.aiPrediction = { temperature: tempValue, confidence: 75 };
                                        setTemperatureSuggestion(tempValue);
                                        setTemperature(tempValue.toString());
                                        logger.debug('Temperature predicted from image:', tempValue);
                                    }
                                }
                            }
                        } catch (tempError) {
                            logger.debug('Temperature prediction failed:', tempError);
                        }
                    }

                    // ==================== GUARDAR LECTURA Y HACER PREDICCIONES ====================
                    storeImageReading(imageReading);
                    
                    // Hacer predicciones inteligentes para completar campos vacíos
                    if (data.fornecedor && data.produto) {
                        const predictions = predictFromReadings(data.fornecedor, data.produto);
                        
                        if (predictions.suggestedNetWeight && !netWeight) {
                            // No auto-llenar peso neto (usuario debe medir)
                        }
                        if (predictions.suggestedTareWeight && !boxTara) {
                            setBoxTara(Math.round(predictions.suggestedTareWeight * 1000).toString());
                        }
                        if (predictions.suggestedTemperature && !temperature) {
                            setTemperatureSuggestion(predictions.suggestedTemperature);
                            setTemperature(predictions.suggestedTemperature.toString());
                        }
                        if (predictions.suggestedExpirationDays && !expirationDate && imageReading.extractedData.productionDate) {
                            // Calcular fecha de vencimiento basada en días típicos
                            try {
                                const prod = new Date(imageReading.extractedData.productionDate);
                                const exp = new Date(prod.getTime() + predictions.suggestedExpirationDays * 24 * 60 * 60 * 1000);
                                const expStr = `${String(exp.getDate()).padStart(2, '0')}/${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`;
                                setExpirationDate(expStr);
                            } catch {
                                // Ignore date calculation errors
                            }
                        }
                        
                        if (predictions.totalLearnings) {
                            setAiAlert(`🧠 Basado en ${predictions.totalLearnings} lecturas previas de ${data.fornecedor} → ${data.produto}`);
                        }
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
            extractedPhotoInfo: extractedPhotoInfo || undefined, // Photo reading info
            aiAnalysis: aiAlert || undefined, // Full AI analysis moved to carousel
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
        <div className="pb-32 pt-2 space-y-4">
            
            {/* 🤖 Dynamic AI Assistant Bubble */}
            <div className={`p-4 rounded-2xl shadow-lg transition-all duration-500 bg-gradient-to-br ${getStatusColor()} relative overflow-hidden group`}>
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                <div className="absolute bottom-0 left-0 w-20 h-20 bg-black/10 rounded-full -ml-8 -mb-8 blur-xl"></div>

                <div className="relative z-10">
                    <div className="flex items-start gap-2 mb-3">
                         <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
                            <span className="material-icons-round text-lg pointer-events-none text-white">smart_toy</span>
                         </div>
                         <div className="flex-1">
                             <div className="bg-white/10 backdrop-blur-sm rounded-lg rounded-tl-none p-2.5 border border-white/10">
                                 <p className="text-xs font-medium opacity-95 leading-snug text-white">
                                    {isReadingImage ? (
                                        <span className="animate-pulse">{t('lbl_analyzing_img')}</span>
                                    ) : extractedPhotoInfo ? (
                                        // Show extracted info from photo (e.g., supplier, product, dates detected)
                                        extractedPhotoInfo
                                    ) : (
                                        // Show form state guidance
                                        assistantMessage
                                    )}
                                 </p>
                             </div>
                             {historyContext && !isReadingImage && (
                                 <p className="text-[9px] mt-1.5 opacity-75 flex items-center gap-1 bg-black/20 px-2.5 py-0.5 rounded-full w-fit text-white backdrop-blur-sm">
                                    <span className="material-icons-round text-[10px] pointer-events-none">history</span>
                                    {historyContext}
                                 </p>
                             )}
                         </div>
                    </div>

                    <div className="flex justify-between items-end border-t border-white/10 pt-2.5">
                        <div className="text-white">
                            <span className="text-[9px] uppercase tracking-widest opacity-70 font-bold mb-0.5 block">Líquido</span>
                            <div className="text-2xl font-black tracking-tighter font-mono leading-none">
                                {netWeight.toFixed(2)}<span className="text-xs opacity-60 ml-0.5 font-sans font-bold">kg</span>
                            </div>
                        </div>
                        <div className="text-right text-white">
                            <span className="text-[9px] uppercase tracking-widest opacity-70 font-bold mb-0.5 block">Diferencia</span>
                            <div className={`text-lg font-bold font-mono bg-white/10 px-2 py-0.5 rounded-lg backdrop-blur-sm inline-block ${Math.abs(difference) > TOLERANCE_KG ? 'animate-pulse' : ''}`}>
                                {difference > 0 ? '+' : ''}{difference.toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ✨ Smart Tips Carousel with Swipe Support */}
            {smartTips.length > 0 && (
                <div 
                    className={`rounded-[2rem] border transition-all duration-300 overflow-hidden shadow-md select-none cursor-grab active:cursor-grabbing ${
                        smartTips[currentTipIndex]?.type === 'ai_analysis' 
                            ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' 
                            : smartTips[currentTipIndex]?.type === 'alert' 
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
                            : smartTips[currentTipIndex]?.type === 'logistics'
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                            : smartTips[currentTipIndex]?.type === 'storage'
                            ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800'
                            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                    }`}
                    onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
                    onTouchEnd={(e) => {
                        const touchEndX = e.changedTouches[0].clientX;
                        const diff = touchStartX - touchEndX;
                        
                        // Swipe left (> 50px) = next tip
                        if (diff > 50) {
                            setCurrentTipIndex(prev => (prev + 1) % smartTips.length);
                            if (autoRotateTimer) clearTimeout(autoRotateTimer);
                        }
                        // Swipe right (< -50px) = previous tip
                        else if (diff < -50) {
                            setCurrentTipIndex(prev => (prev - 1 + smartTips.length) % smartTips.length);
                            if (autoRotateTimer) clearTimeout(autoRotateTimer);
                        }
                    }}
                >
                    <div className="p-4">
                        {/* Tip Header */}
                        <div className="flex items-center justify-between mb-2">
                            <h3 className={`text-sm font-bold ${
                                smartTips[currentTipIndex]?.type === 'ai_analysis' 
                                    ? 'text-purple-700 dark:text-purple-200' 
                                    : smartTips[currentTipIndex]?.type === 'alert' 
                                    ? 'text-red-700 dark:text-red-200' 
                                    : smartTips[currentTipIndex]?.type === 'logistics'
                                    ? 'text-blue-700 dark:text-blue-200'
                                    : smartTips[currentTipIndex]?.type === 'storage'
                                    ? 'text-cyan-700 dark:text-cyan-200'
                                    : 'text-amber-700 dark:text-amber-200'
                            }`}>
                                {smartTips[currentTipIndex]?.title}
                            </h3>
                            {smartTips.length > 1 && (
                                <span className="text-[10px] opacity-60 font-mono">
                                    {currentTipIndex + 1}/{smartTips.length}
                                </span>
                            )}
                        </div>
                        
                        {/* Tip Content */}
                        <p className={`text-sm leading-relaxed ${
                            smartTips[currentTipIndex]?.type === 'ai_analysis' 
                                ? 'text-purple-800 dark:text-purple-100' 
                                : smartTips[currentTipIndex]?.type === 'alert' 
                                ? 'text-red-800 dark:text-red-100' 
                                : smartTips[currentTipIndex]?.type === 'logistics'
                                ? 'text-blue-800 dark:text-blue-100'
                                : smartTips[currentTipIndex]?.type === 'storage'
                                ? 'text-cyan-800 dark:text-cyan-100'
                                : 'text-amber-800 dark:text-amber-100'
                        }`}>
                            {smartTips[currentTipIndex]?.content}
                        </p>
                        
                        {/* Navigation Dots & Gesture Hint */}
                        <div className="flex flex-col gap-2 mt-3 items-center">
                            {smartTips.length > 1 && (
                                <>
                                    <div className="flex gap-2 justify-center">
                                        {smartTips.map((_, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    setCurrentTipIndex(idx);
                                                    // Reset auto-rotate timer
                                                    if (autoRotateTimer) clearTimeout(autoRotateTimer);
                                                }}
                                                className={`h-2 rounded-full transition-all ${
                                                    idx === currentTipIndex 
                                                        ? 'w-6 bg-current opacity-75' 
                                                        : 'w-2 opacity-30 hover:opacity-50'
                                                }`}
                                                aria-label={`Tip ${idx + 1}`}
                                            />
                                        ))}
                                    </div>
                                    <span className="text-[9px] opacity-50 font-medium">← Desliza para navegar →</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 1. Evidence Section (Compact & Optimized) */}
            <div 
                className={`rounded-[2rem] border transition-all duration-300 overflow-hidden ${getSectionStyle('evidence')}`}
                onClick={() => setActiveSection('evidence')}
            >
                {!evidence ? (
                    <div className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                                <span className="material-icons-round text-xl pointer-events-none">image</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{t('lbl_evidence_section')}</span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">Captura o selecciona una foto</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                                className="bg-primary-600 dark:bg-primary-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                            >
                                <span className="material-icons-round text-sm pointer-events-none">photo_camera</span>
                                {t('btn_camera')}
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); galleryInputRef.current?.click(); }}
                                className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 w-10 h-10 rounded-xl flex items-center justify-center border border-slate-200 dark:border-transparent hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-95 transition-all"
                            >
                                <span className="material-icons-round text-lg pointer-events-none">image</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-transparent dark:from-slate-900/20 dark:to-transparent">
                         {/* Mensaje de Foto Tomada */}
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center flex-shrink-0">
                                <span className="material-icons-round text-xl pointer-events-none">check</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">Foto tomada</span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">IA analizando para temperatura...</span>
                            </div>
                         </div>

                         {/* Botón Delete y Cámara */}
                         <div className="flex items-center gap-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                                className="bg-primary-600 dark:bg-primary-500 text-white p-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all"
                                title="Retomar foto"
                            >
                                <span className="material-icons-round text-lg pointer-events-none">photo_camera</span>
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setEvidence(null); setAiAlert(null); setBatch(''); setExpirationDate(''); setProductionDate(''); }}
                                className="bg-red-50 dark:bg-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/30 text-red-600 dark:text-red-400 p-2.5 rounded-xl transition-colors"
                                title="Eliminar foto"
                            >
                                <span className="material-icons-round text-lg pointer-events-none">delete</span>
                            </button>
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
                <div className="p-4 space-y-3">
                    <div className="flex items-center gap-3 mb-1 opacity-60 dark:opacity-80 text-slate-500 dark:text-slate-400">
                        <span className="material-icons-round pointer-events-none text-lg">store</span>
                        <span className="text-xs font-bold uppercase tracking-wider">{t('lbl_identity')}</span>
                    </div>

                    <div className="space-y-3">
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

                        {/* Temperature Field - Above Dates */}
                        <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-transparent rounded-2xl px-3 py-3 focus-within:ring-4 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/20 transition-all group">
                            <div className="flex items-center gap-2 flex-1">
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
                            </div>
                            {temperatureSuggestion && !temperature && (
                                <div className="px-2.5 py-1 bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 rounded-lg text-[10px] font-bold flex items-center gap-1 whitespace-nowrap">
                                    <span>🌡️</span>
                                    <span>{temperatureSuggestion}°</span>
                                </div>
                            )}
                            {temperatureSuggestion && (
                                <div className="text-primary-600 dark:text-primary-400 opacity-70" title="IA sugirió esta temperatura">
                                    <span className="material-icons-round text-base pointer-events-none">auto_awesome</span>
                                </div>
                            )}
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
                    </div>
                </div>
            </div>

            {/* 3. Weights Section */}
            <div 
                className={`rounded-[2.5rem] border transition-all duration-300 overflow-hidden ${getSectionStyle('weights')}`}
                onFocus={() => setActiveSection('weights')}
            >
                <div className="p-3">
                     <div className="flex items-center gap-2 mb-2.5 opacity-60 dark:opacity-80 text-slate-500 dark:text-slate-400">
                        <span className="material-icons-round pointer-events-none text-base">scale</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider">{t('lbl_weighing')}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-100 dark:bg-black/20 rounded-xl p-2.5 border border-slate-200 dark:border-transparent focus-within:ring-4 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/20 transition-all">
                            <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-0.5">{t('lbl_note_weight')}</label>
                            <div className="flex items-baseline gap-0.5">
                                <input 
                                    ref={noteInputRef}
                                    type="number" 
                                    value={noteWeight}
                                    onChange={e => setNoteWeight(e.target.value)}
                                    className="w-full bg-transparent text-xl font-black text-slate-800 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700 font-mono tracking-tight"
                                    placeholder="0"
                                />
                                <span className="text-[9px] text-slate-400 dark:text-slate-600 font-bold">kg</span>
                            </div>
                        </div>
                        <div className="bg-slate-100 dark:bg-black/20 rounded-xl p-2.5 border border-slate-200 dark:border-transparent focus-within:ring-4 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/20 transition-all">
                            <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-0.5">{t('lbl_gross_weight')}</label>
                             <div className="flex items-baseline gap-0.5">
                                <input 
                                    ref={grossInputRef}
                                    type="text" 
                                    value={grossWeight}
                                    onChange={e => setGrossWeight(e.target.value)}
                                    onFocus={() => {
                                        setActiveSection('weights');
                                        setShowBoxes(false); // Auto-collapse tara when moving to gross weight
                                    }}
                                    className="w-full bg-transparent text-xl font-black text-slate-800 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700 font-mono tracking-tight"
                                    placeholder="0 o 50, 52, 49"
                                />
                                <span className="text-[9px] text-slate-400 dark:text-slate-600 font-bold">kg</span>
                            </div>
                            {grossWeight.includes(',') && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
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
                    className="w-full flex items-center justify-between p-4"
                    type="button"
                >
                    <div className="flex items-center gap-3">
                         <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${prediction.suggestedTaraBox ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-400'}`}>
                            <span className="material-icons-round text-lg pointer-events-none">inventory_2</span>
                         </div>
                         <div className="text-left">
                             <span className="font-bold text-slate-700 dark:text-white text-sm block mb-0">{t('lbl_tara_section')}</span>
                             {prediction.suggestedTaraBox && !showBoxes && (
                                 <span className="text-[9px] bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded-full font-bold">{t('lbl_ai_pattern')}</span>
                             )}
                         </div>
                    </div>
                    
                    {!showBoxes && (Number(boxQty) > 0 || Number(boxTara) > 0 || Number(boxQtyEmbalaje) > 0 || Number(boxTaraEmbalaje) > 0) ? (
                        <div className="flex flex-col items-end gap-0.5 text-[10px] text-slate-600 dark:text-slate-300 font-mono">
                             {Number(boxQty) > 0 && Number(boxTara) > 0 && (
                                 <div className="font-medium">
                                     📦 Cx: {Number(boxQty)} × {(Number(boxTara)/1000).toFixed(3)} = {(Number(boxQty) * Number(boxTara) / 1000).toFixed(3)} kg
                                 </div>
                             )}
                             {Number(boxQtyEmbalaje) > 0 && Number(boxTaraEmbalaje) > 0 && (
                                 <div className="font-medium">
                                     📦 Emb: {Number(boxQtyEmbalaje)} × {(Number(boxTaraEmbalaje)/1000).toFixed(3)} = {(Number(boxQtyEmbalaje) * Number(boxTaraEmbalaje) / 1000).toFixed(3)} kg
                                 </div>
                             )}
                             <div className="font-bold text-slate-800 dark:text-white border-t border-slate-300 dark:border-slate-600 pt-0.5 mt-0.5">
                                 Σ {totalTara.toFixed(3)} kg
                             </div>
                         </div>
                    ) : (
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 transition-transform ${showBoxes ? 'rotate-180 bg-slate-200 dark:bg-slate-700' : ''}`}>
                            <span className="material-icons-round text-sm text-slate-400 dark:text-slate-400 pointer-events-none">expand_more</span>
                         </div>
                    )}
                </button>

                {showBoxes && (
                    <div className="px-4 pb-4 animate-fade-in space-y-3">
                        {prediction.suggestedTaraBox !== undefined && (
                            <button
                                onClick={() => setBoxTara((prediction.suggestedTaraBox! * 1000).toString())}
                                className="w-full py-2.5 bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 rounded-2xl text-xs font-bold border border-primary-100 dark:border-primary-500/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                                type="button"
                            >
                                <span className="material-icons-round text-lg pointer-events-none">auto_fix_normal</span>
                                {t('btn_apply_tara', { supplier, weight: (prediction.suggestedTaraBox * 1000).toFixed(0) })}
                            </button>
                        )}
                        
                        {/* Cajas (Left Column) */}
                        <div className="space-y-2 pb-3 border-b border-slate-200 dark:border-slate-700/50">
                            <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                <span className="material-icons-round text-sm">inventory_2</span>
                                Cajas
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-50 dark:bg-black/20 rounded-2xl p-2.5 border border-slate-100 dark:border-transparent">
                                    <label className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1 block text-center">{t('lbl_unit_weight')}</label>
                                    <input 
                                        ref={boxTaraRef}
                                        type="number" 
                                        value={boxTara} 
                                        onChange={e => setBoxTara(e.target.value)}
                                        onBlur={() => {
                                            // Auto-focus to quantity when tara is filled
                                            if (boxTara && !boxQty) {
                                                setTimeout(() => boxQtyRef.current?.focus(), 100);
                                            }
                                        }}
                                        className="w-full bg-white dark:bg-slate-800 border-none rounded-lg px-2 py-2 text-sm focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/20 outline-none transition-all font-mono font-bold text-center text-slate-800 dark:text-white shadow-sm" 
                                        placeholder="0" 
                                    />
                                </div>
                                <div className="bg-slate-50 dark:bg-black/20 rounded-2xl p-2.5 border border-slate-100 dark:border-transparent">
                                    <label className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1 block text-center">{t('lbl_qty')}</label>
                                    <input 
                                        ref={boxQtyRef}
                                        type="number" 
                                        value={boxQty} 
                                        onChange={e => setBoxQty(e.target.value)}
                                        onBlur={() => {
                                            // When quantity is filled, trigger auto-collapse of tara section
                                            if (boxQty && showBoxes) {
                                                const timer = setTimeout(() => {
                                                    setShowBoxes(false);
                                                    setActiveSection('weights');
                                                    if (!noteWeight) {
                                                        noteInputRef.current?.focus();
                                                    } else {
                                                        grossInputRef.current?.focus();
                                                    }
                                                }, 500);
                                                return () => clearTimeout(timer);
                                            }
                                        }}
                                        className="w-full bg-white dark:bg-slate-800 border-none rounded-lg px-2 py-2 text-sm focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/20 outline-none transition-all font-mono font-bold text-center text-slate-800 dark:text-white shadow-sm" 
                                        placeholder="0" 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Embalajes (Right Column) */}
                        <div className="space-y-2 pb-3">
                            <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                <span className="material-icons-round text-sm">layers</span>
                                Embalajes
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-50 dark:bg-black/20 rounded-2xl p-2.5 border border-slate-100 dark:border-transparent">
                                    <label className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1 block text-center">{t('lbl_unit_weight')}</label>
                                    <input 
                                        ref={boxTaraEmbalajeRef}
                                        type="number" 
                                        value={boxTaraEmbalaje} 
                                        onChange={e => setBoxTaraEmbalaje(e.target.value)}
                                        onBlur={() => {
                                            // Auto-focus to quantity when tara embalaje is filled
                                            if (boxTaraEmbalaje && !boxQtyEmbalaje) {
                                                setTimeout(() => boxQtyEmbalajeRef.current?.focus(), 100);
                                            }
                                        }}
                                        className="w-full bg-white dark:bg-slate-800 border-none rounded-lg px-2 py-2 text-sm focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/20 outline-none transition-all font-mono font-bold text-center text-slate-800 dark:text-white shadow-sm" 
                                        placeholder="0" 
                                    />
                                </div>
                                <div className="bg-slate-50 dark:bg-black/20 rounded-2xl p-2.5 border border-slate-100 dark:border-transparent">
                                    <label className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1 block text-center">{t('lbl_qty')}</label>
                                    <input 
                                        ref={boxQtyEmbalajeRef}
                                        type="number" 
                                        value={boxQtyEmbalaje} 
                                        onChange={e => setBoxQtyEmbalaje(e.target.value)}
                                        onBlur={() => {
                                            // When quantity embalaje is filled, trigger collapse
                                            if (boxQtyEmbalaje && showBoxes) {
                                                const timer = setTimeout(() => {
                                                    setShowBoxes(false);
                                                    setActiveSection('weights');
                                                    if (!noteWeight) {
                                                        noteInputRef.current?.focus();
                                                    } else {
                                                        grossInputRef.current?.focus();
                                                    }
                                                }, 500);
                                                return () => clearTimeout(timer);
                                            }
                                        }}
                                        className="w-full bg-white dark:bg-slate-800 border-none rounded-lg px-2 py-2 text-sm focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/20 outline-none transition-all font-mono font-bold text-center text-slate-800 dark:text-white shadow-sm" 
                                        placeholder="0" 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 pb-4 grid grid-cols-2 gap-3">
                <button 
                    onClick={() => {
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
                    }}
                    className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white font-bold h-14 rounded-full shadow-xl shadow-red-500/20 dark:shadow-red-600/10 flex items-center justify-center gap-2 active:scale-95 transition-all"
                    type="button"
                    title="Limpiar formulario"
                >
                    <span className="material-icons-round pointer-events-none text-xl">delete_sweep</span>
                    <span className="text-sm pointer-events-none tracking-wide">Limpiar</span>
                </button>

                <button 
                    onClick={handleSave}
                    className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold h-14 rounded-full shadow-xl shadow-slate-900/20 dark:shadow-white/10 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all"
                    type="button"
                >
                    <span className="material-icons-round pointer-events-none text-xl">save</span>
                    <span className="text-sm pointer-events-none tracking-wide">{t('btn_save')}</span>
                </button>
            </div>
        </div>
    );
};
