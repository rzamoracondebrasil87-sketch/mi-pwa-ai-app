
export type Language = 'pt' | 'es' | 'en';

export interface UserProfile {
    name: string;
    role: string;
    photo?: string; // Base64 string
}

export interface WeighingRecord {
    id: string;
    timestamp: number;
    supplier: string;
    product: string;
    grossWeight: number; // Peso Bruto
    noteWeight: number;  // Peso Nota
    netWeight: number;   // Peso Liquido
    taraTotal: number;
    boxes: { qty: number; unitTara: number };
    taraEmbalaje?: { qty: number; unitTara: number }; // Segunda tara de embalaje
    temperature?: number; // Temperatura en °C
    temperatureSuggestion?: number; // IA sugiere temperatura óptima
    status: 'pending' | 'verified' | 'error';
    extractedPhotoInfo?: string; // Basic info extracted from photo (e.g., "Lote: XYZ, Fab: DD/MM/YY")
    aiAnalysis?: string;
    evidence?: string; // Base64 string of the image
    batch?: string; // Lote do produto
    expirationDate?: string; // Data de validade
    productionDate?: string; // Data de fabricação
    grossWeightDetails?: number[]; // Array of individual weights if entered as comma-separated
}

export interface ImageReading {
    id: string;
    timestamp: number;
    supplier: string;
    product: string;
    imageBase64: string; // Original image
    extractedData: {
        product?: string;
        productionDate?: string;
        expirationDate?: string;
        batch?: string;
        netWeight?: number;
        grossWeight?: number;
        tareWeight?: number;
        temperature?: number;
        barcode?: string;
        type?: string;
        sif?: string;
    };
    aiPrediction?: {
        temperature?: number;
        confidence?: number;
    };
    userVerified?: boolean;
    confidence: number; // 0-100 OCR confidence
}

export interface LearningPattern {
    supplier: string;
    product: string;
    totalReadings: number;
    averageNetWeight: number;
    averageTareWeight: number;
    averageTemperature: number;
    averageGrossWeight: number;
    commonExpirationDays: number; // Dias típicos desde producción a vencimiento
    commonProductType: string; // congelado|resfriado|fresco|indeterminado
    lastReading: number; // timestamp
    readings: ImageReading[]; // Last 50 readings for this pattern
}

export interface KnowledgeBase {
    suppliers: string[];
    products: string[];
    imageReadings: ImageReading[]; // All OCR readings for learning
    learningPatterns: Record<string, LearningPattern>; // Key: "supplier::product"
    // Legacy patterns (kept for backward compatibility)
    patterns: Record<string, {
        typicalTaraBox: number;
        lastUsedProduct: string;
    }>;
}

export interface InstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface AppConfig {
    version: string;
    lastUpdate: number;
}

export enum AppStatus {
    IDLE = 'IDLE',
    INSTALLABLE = 'INSTALLABLE',
    INSTALLED = 'INSTALLED'
}

export interface Message {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: number;
}

export interface AnalyticsEvent {
    eventName: string;
    timestamp: number;
    properties?: Record<string, any>;
}

export interface UserStats {
    totalSessions: number;
    totalMessagesSent: number;
    lastVisit: number;
    isInstalled: boolean;
    installDate?: number;
}
