
import { KnowledgeBase, WeighingRecord, UserProfile, ImageReading, LearningPattern } from "../types";

const KEY_RECORDS = 'conferente_records';
const KEY_KNOWLEDGE = 'conferente_knowledge';
const KEY_PROFILE = 'conferente_profile';
const KEY_THEME = 'conferente_theme';

const defaultKnowledge: KnowledgeBase = {
    suppliers: [],
    products: [],
    imageReadings: [],
    learningPatterns: {},
    patterns: {}
};

const defaultProfile: UserProfile = {
    name: 'Usuario',
    role: 'Conferente'
};

// --- Theme Functions ---
export const getTheme = (): 'light' | 'dark' => {
    try {
        return (localStorage.getItem(KEY_THEME) as 'light' | 'dark') || 'light';
    } catch {
        return 'light';
    }
};

export const saveTheme = (theme: 'light' | 'dark') => {
    localStorage.setItem(KEY_THEME, theme);
};

// --- Profile Functions ---

export const saveUserProfile = (profile: UserProfile) => {
    localStorage.setItem(KEY_PROFILE, JSON.stringify(profile));
};

export const getUserProfile = (): UserProfile => {
    try {
        const data = localStorage.getItem(KEY_PROFILE);
        return data ? JSON.parse(data) : defaultProfile;
    } catch {
        return defaultProfile;
    }
};

// --- Record Functions ---

export const saveRecord = (record: WeighingRecord) => {
    const records = getRecords();
    records.unshift(record);
    localStorage.setItem(KEY_RECORDS, JSON.stringify(records));
    learnFromRecord(record);
};

export const deleteRecord = (id: string) => {
    const records = getRecords();
    const updatedRecords = records.filter(r => r.id !== id);
    localStorage.setItem(KEY_RECORDS, JSON.stringify(updatedRecords));
};

export const clearAllRecords = () => {
    localStorage.removeItem(KEY_RECORDS);
};

export const getRecords = (): WeighingRecord[] => {
    try {
        const data = localStorage.getItem(KEY_RECORDS);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
};

// New helper for AI Context
export const getLastRecordBySupplier = (supplier: string): WeighingRecord | undefined => {
    const records = getRecords();
    return records.find(r => r.supplier.toLowerCase() === supplier.toLowerCase());
};

const learnFromRecord = (record: WeighingRecord) => {
    const kb = getKnowledgeBase();
    
    // Add unique supplier/product
    if (!kb.suppliers.includes(record.supplier)) kb.suppliers.push(record.supplier);
    if (!kb.products.includes(record.product)) kb.products.push(record.product);

    // Learn patterns STRICTLY by Supplier + Product combination
    const key = `${record.supplier}::${record.product}`; 
    
    // Get existing pattern to preserve data if needed
    const existingPattern = kb.patterns[key];

    kb.patterns[key] = {
        typicalTaraBox: record.boxes.unitTara > 0 ? record.boxes.unitTara : (existingPattern?.typicalTaraBox || 0),
        lastUsedProduct: record.product 
    };

    // Update supplier preference (Last product brought by this supplier)
    const supplierKey = `SUP::${record.supplier}`;
    
    kb.patterns[supplierKey] = {
        typicalTaraBox: 0, // Not used for general supplier key
        lastUsedProduct: record.product
    };

    localStorage.setItem(KEY_KNOWLEDGE, JSON.stringify(kb));
};

/**
 * NUEVO SISTEMA DE APRENDIZAJE v2
 * Almacena una lectura de etiqueta con datos extraídos del OCR/IA
 */
export const storeImageReading = (reading: ImageReading) => {
    const kb = getKnowledgeBase();
    
    // Agregar a lecturas globales (mantener últimas 500)
    if (!kb.imageReadings) kb.imageReadings = [];
    kb.imageReadings.unshift(reading);
    if (kb.imageReadings.length > 500) {
        kb.imageReadings = kb.imageReadings.slice(0, 500);
    }

    // Actualizar suppliers y products
    if (!kb.suppliers.includes(reading.supplier)) kb.suppliers.push(reading.supplier);
    if (!kb.products.includes(reading.product)) kb.products.push(reading.product);

    // Actualizar pattern de aprendizaje
    if (!kb.learningPatterns) kb.learningPatterns = {};
    const patternKey = `${reading.supplier}::${reading.product}`;
    
    const existing = kb.learningPatterns[patternKey];
    const newPattern: LearningPattern = {
        supplier: reading.supplier,
        product: reading.product,
        totalReadings: (existing?.totalReadings || 0) + 1,
        averageNetWeight: calculateAverage([
            ...(existing?.readings || []),
            reading
        ], 'netWeight'),
        averageTareWeight: calculateAverage([
            ...(existing?.readings || []),
            reading
        ], 'tareWeight'),
        averageTemperature: calculateAverage([
            ...(existing?.readings || []),
            reading
        ], 'temperature'),
        averageGrossWeight: calculateAverage([
            ...(existing?.readings || []),
            reading
        ], 'grossWeight'),
        commonExpirationDays: calculateExpirationDays([
            ...(existing?.readings || []),
            reading
        ]),
        lastReading: reading.timestamp,
        readings: [
            reading,
            ...(existing?.readings || [])
        ].slice(0, 50) // Mantener últimas 50
    };
    
    kb.learningPatterns[patternKey] = newPattern;
    localStorage.setItem(KEY_KNOWLEDGE, JSON.stringify(kb));
};

/**
 * Calcula el promedio de un campo numérico desde readings
 */
function calculateAverage(readings: ImageReading[], field: keyof ImageReading['extractedData']): number {
    const values = readings
        .map(r => r.extractedData[field])
        .filter((v): v is number => typeof v === 'number' && v > 0);
    
    if (values.length === 0) return 0;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

/**
 * Calcula días típicos entre producción y vencimiento
 */
function calculateExpirationDays(readings: ImageReading[]): number {
    const diffs = readings
        .filter(r => r.extractedData.productionDate && r.extractedData.expirationDate)
        .map(r => {
            try {
                const prod = new Date(r.extractedData.productionDate!);
                const exp = new Date(r.extractedData.expirationDate!);
                return Math.round((exp.getTime() - prod.getTime()) / (1000 * 60 * 60 * 24));
            } catch {
                return 0;
            }
        })
        .filter(d => d > 0);
    
    if (diffs.length === 0) return 0;
    return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
}

/**
 * Obtiene predicciones inteligentes basadas en aprendizaje previo
 */
export const predictFromReadings = (supplier: string, product?: string) => {
    const kb = getKnowledgeBase();
    
    if (!supplier) return {};
    
    // Si no hay producto específico, predecir basado en supplier
    if (!product) {
        // Encontrar último producto de este supplier
        const lastReading = kb.imageReadings?.find(r => r.supplier === supplier);
        if (lastReading) {
            return {
                suggestedProduct: lastReading.product,
                suggestedExpirationDays: 30 // Default
            };
        }
        return {};
    }

    // Con supplier + product específico
    const patternKey = `${supplier}::${product}`;
    const pattern = kb.learningPatterns?.[patternKey];
    
    if (!pattern || pattern.totalReadings < 2) {
        return {}; // Necesitamos mínimo 2 readings para hacer predicciones
    }

    return {
        suggestedNetWeight: pattern.averageNetWeight,
        suggestedGrossWeight: pattern.averageGrossWeight,
        suggestedTareWeight: pattern.averageTareWeight,
        suggestedTemperature: pattern.averageTemperature > 0 ? Math.round(pattern.averageTemperature) : undefined,
        suggestedExpirationDays: pattern.commonExpirationDays > 0 ? pattern.commonExpirationDays : 30,
        totalLearnings: pattern.totalReadings,
        lastReadingTime: pattern.lastReading
    };
};

/**
 * Obtiene todos los patterns de aprendizaje para un producto
 */
export const getPatternsByProduct = (product: string) => {
    const kb = getKnowledgeBase();
    const result: Record<string, LearningPattern> = {};
    
    Object.entries(kb.learningPatterns || {}).forEach(([key, pattern]) => {
        if (pattern.product === product) {
            result[key] = pattern;
        }
    });
    
    return result;
};

/**
 * Obtiene readings recientes para un supplier + product
 */
export const getRecentReadings = (supplier: string, product: string, limit = 10): ImageReading[] => {
    const kb = getKnowledgeBase();
    return (kb.imageReadings || [])
        .filter(r => r.supplier === supplier && r.product === product)
        .slice(0, limit);
};

export const getKnowledgeBase = (): KnowledgeBase => {
    try {
        const data = localStorage.getItem(KEY_KNOWLEDGE);
        const kb = data ? JSON.parse(data) : defaultKnowledge;
        // Asegurar que existan los campos nuevos
        if (!kb.imageReadings) kb.imageReadings = [];
        if (!kb.learningPatterns) kb.learningPatterns = {};
        if (!kb.patterns) kb.patterns = {};
        return kb;
    } catch {
        return defaultKnowledge;
    }
};

export const predictData = (supplier: string, product?: string) => {
    const kb = getKnowledgeBase();
    
    if (supplier && !product) {
        // Predict product based on supplier history
        const supKey = `SUP::${supplier}`;
        const lastProduct = kb.patterns[supKey]?.lastUsedProduct;
        return { suggestedProduct: lastProduct };
    }

    if (supplier && product) {
        // Predict taras based on Supplier AND Product specific combination
        const key = `${supplier}::${product}`;
        const pattern = kb.patterns[key];
        if (pattern) {
            return {
                suggestedTaraBox: pattern.typicalTaraBox
            };
        }
    }
    return {};
};
