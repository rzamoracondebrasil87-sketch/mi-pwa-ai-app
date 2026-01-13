# 🧠 AI Learning System v2 - Complete Redesign

## Overview

The new AI learning system automatically learns from every label photo captured and uses that knowledge to make intelligent predictions for future entries from the same supplier and product.

**Key Improvements:**
- ✅ Stores complete image readings with extracted data
- ✅ Creates learning patterns for Supplier + Product combinations
- ✅ Auto-predicts fields based on historical data
- ✅ Learns average weight, tare, temperature, expiration dates
- ✅ Shows confidence levels and number of previous readings

---

## Architecture

### 1. **ImageReading** (New Type)
Stores every successful OCR/Gemini extraction:

```typescript
interface ImageReading {
    id: string;                          // Unique reading ID
    timestamp: number;                   // When captured
    supplier: string;                    // Supplier name
    product: string;                     // Product name
    imageBase64: string;                 // Original image (for review)
    
    extractedData: {
        product?: string;                // From OCR
        productionDate?: string;         // DD/MM/YYYY format
        expirationDate?: string;         // DD/MM/YYYY format
        batch?: string;                  // Lot number
        netWeight?: number;              // kg
        grossWeight?: number;            // kg
        tareWeight?: number;             // kg (calculated)
        temperature?: number;            // °C
        barcode?: string;
        type?: string;                   // congelado|resfriado|fresco
        sif?: string;
    };
    
    aiPrediction?: {
        temperature?: number;            // IA predicted temp
        confidence?: number;             // 0-100 confidence
    };
    
    userVerified?: boolean;              // User confirmed this reading
    confidence: number;                  // OCR confidence 0-100
}
```

### 2. **LearningPattern** (New Type)
Aggregated knowledge about supplier + product combinations:

```typescript
interface LearningPattern {
    supplier: string;
    product: string;
    
    // Aggregated statistics
    totalReadings: number;               // How many times this was read
    averageNetWeight: number;            // kg
    averageTareWeight: number;           // kg
    averageTemperature: number;          // °C
    averageGrossWeight: number;          // kg
    commonExpirationDays: number;        // Days from production to expiration
    
    lastReading: number;                 // timestamp
    readings: ImageReading[];            // Last 50 readings (for review)
}
```

### 3. **KnowledgeBase** Updates
Extended with new fields while maintaining backward compatibility:

```typescript
interface KnowledgeBase {
    suppliers: string[];                 // List of known suppliers
    products: string[];                  // List of known products
    
    imageReadings: ImageReading[];       // All captured readings (last 500)
    learningPatterns: Record<string, LearningPattern>;  // Key: "supplier::product"
    
    // Legacy (kept for backward compatibility)
    patterns: Record<string, {...}>;
}
```

---

## Storage Functions

### `storeImageReading(reading: ImageReading)`
Saves a new image reading and updates learning patterns.

**What it does:**
1. Adds reading to `imageReadings` array (keeps last 500)
2. Updates supplier/product lists
3. Calculates new statistics for the pattern
4. Stores averages and totals in `learningPatterns`

**Called from:** `WeighingForm.tsx` → after Gemini processes image

```typescript
const imageReading: ImageReading = {
    id: `reading_${Date.now()}`,
    timestamp: Date.now(),
    supplier: 'Seara',
    product: 'ASA RESF',
    imageBase64: base64,
    extractedData: {
        netWeight: 15.2,
        grossWeight: 16.5,
        temperature: -12,
        expirationDate: '25/05/2025'
    },
    confidence: 85
};

storeImageReading(imageReading);  // Automatically updates learning
```

---

## Prediction Functions

### `predictFromReadings(supplier: string, product?: string)`
Returns intelligent suggestions based on learning history.

**Returns:**
```typescript
{
    suggestedNetWeight?: number;         // Average weight for this product
    suggestedGrossWeight?: number;
    suggestedTareWeight?: number;        // Auto-fills tara box field
    suggestedTemperature?: number;       // Auto-fills temperature field
    suggestedExpirationDays?: number;    // Days from production to expiration
    totalLearnings: number;              // How many readings learned from
    lastReadingTime: number;             // When was it last seen
}
```

**Usage in WeighingForm.tsx:**
```typescript
const predictions = predictFromReadings('Seara', 'ASA RESF');

if (predictions.suggestedTemperature && !temperature) {
    setTemperature(predictions.suggestedTemperature.toString());
}

if (predictions.suggestedTareWeight && !boxTara) {
    setBoxTara(Math.round(predictions.suggestedTareWeight * 1000).toString());
}

if (predictions.totalLearnings) {
    setAiAlert(`🧠 Basado en ${predictions.totalLearnings} lecturas previas`);
}
```

---

### `getPatternsByProduct(product: string)`
Returns all patterns where the product appears (from any supplier).

**Returns:** Record of all `LearningPattern` objects for that product

**Use case:** Compare same product from different suppliers (to spot quality differences)

---

### `getRecentReadings(supplier: string, product: string, limit = 10)`
Returns the last N image readings for a specific supplier + product.

**Use case:** Review history, verify extraction quality, spot inconsistencies

---

## Complete Flow: From Photo to Learning

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER CAPTURES PHOTO                                      │
│    └─ Camera → base64 image                                │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 2. VISION API SENDS TO GEMINI                              │
│    └─ OCR prompt → Gemini analyzes image                   │
│    └─ Returns: produto, fornecedor, peso_liquido, etc.    │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 3. CREATE ImageReading OBJECT                              │
│    ├─ Extract values from Gemini response                  │
│    ├─ Calculate tara (if peso_bruto & peso_liquido)       │
│    ├─ Gemini predicts temperature from image               │
│    └─ Create ImageReading with all extracted data          │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 4. STORE IMAGE READING                                      │
│    └─ storeImageReading(imageReading)                      │
│    ├─ Add to imageReadings array                           │
│    ├─ Update supplier/product lists                        │
│    └─ Recalculate learning patterns:                       │
│        ├─ Average net weight                               │
│        ├─ Average tare weight                              │
│        ├─ Average temperature                              │
│        ├─ Common expiration days                           │
│        └─ Keep last 50 readings                            │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 5. MAKE PREDICTIONS                                         │
│    └─ predictions = predictFromReadings(supplier, product) │
│    ├─ Fill empty form fields:                             │
│    │   ├─ Temperature                                      │
│    │   ├─ Tara weight                                      │
│    │   ├─ Expiration date (calculate from days)            │
│    │   └─ Show "🧠 Basado en X lecturas previas"          │
│    └─ Display confidence: "totalLearnings"                 │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 6. USER VERIFIES & SAVES RECORD                            │
│    └─ saveRecord() → Peso real medido, confirma campos     │
│    └─ Record is added to history                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Example: First Reading vs Second Reading

### First Time: "Seara → ASA RESF"
```
✓ Photo captured
✓ OCR: temperatura_rotulo = "-12°C", peso_liquido_kg = 15.2
✓ ImageReading stored:
    supplier: "Seara"
    product: "ASA RESF"  
    extractedData: { temperature: -12, netWeight: 15.2 }
    confidence: 85

✓ Learning pattern created:
    totalReadings: 1 (not enough for predictions yet)
    averageTemperature: -12
    averageNetWeight: 15.2

⚠️ Predictions: Not enough data (need minimum 2)
```

### Second Time: "Seara → ASA RESF" (same product)
```
✓ Photo captured
✓ OCR extracts new data

✓ ImageReading stored

✓ Learning pattern UPDATED:
    totalReadings: 2 ✅ (now can make predictions!)
    averageTemperature: -12 (avg of -12 and -12)
    averageNetWeight: 15.1 (avg of 15.2 and 15.0)
    averageGrossWeight: 16.4
    commonExpirationDays: 365

✅ Predictions NOW AVAILABLE:
    suggestedTemperature: -12 ← Auto-fills!
    suggestedNetWeight: 15.1
    suggestedTareWeight: 1.3
    totalLearnings: 2 ✓ Based on 2 previous readings
```

---

## Storage Details

### localStorage Keys
```javascript
localStorage.getItem('conferente_knowledge');  // Contains all learning data
// {
//   suppliers: ["Seara", "Belo Horizonte", "Local A"],
//   products: ["ASA RESF", "CARNE MOIDA", "FRANGO"],
//   imageReadings: [
//     { id: "reading_1703...", supplier: "Seara", ... },
//     ...
//   ],
//   learningPatterns: {
//     "Seara::ASA RESF": { totalReadings: 5, averageTemp: -12, ... },
//     "Belo Horizonte::CARNE MOIDA": { totalReadings: 3, ... }
//   }
// }
```

### Data Retention
- **imageReadings**: Last 500 readings (older deleted)
- **learningPatterns**: All patterns kept indefinitely
- **readings per pattern**: Last 50 kept for review

---

## Confidence & Thresholds

### Minimum readings for predictions: **2**
```typescript
if (pattern.totalReadings < 2) {
    return {};  // Not enough data
}
```

### Confidence levels in readings:
- **Alta** (High) → 90% confidence
- **Media** (Medium) → 60% confidence  
- **Baja** (Low) → 40% confidence

### Temperature prediction confidence:
- From OCR label: 95% confidence
- From Gemini AI image analysis: 75% confidence

---

## Use Cases

### 1️⃣ Automatic Field Population
When user captures "Seara → ASA RESF" and:
- System learned from 5 previous readings
- Average temperature: -12°C
- **Action:** Auto-fill temperature field with "-12"

### 2️⃣ Quality Control by Supplier
Detect if a supplier's products have unusual variations:
```typescript
const patterns = getPatternsByProduct('CARNE MOIDA');
// Shows all suppliers and their patterns
// If "Supplier A" averages 5kg but suddenly 3kg → alert!
```

### 3️⃣ Historical Verification
User doubts yesterday's entry:
```typescript
const readings = getRecentReadings('Seara', 'ASA RESF', 10);
// Shows last 10 photos with their extracted data
// User can visually verify accuracy
```

### 4️⃣ Expiration Date Prediction
If product always takes 365 days from production to expiration:
```typescript
const prod = new Date('15/01/2025');
const exp = new Date(prod + 365 days);  // 15/01/2026
setExpirationDate(exp);
```

---

## Future Enhancements

1. **User Feedback Loop**
   - User marks "this extraction was wrong" → decreases confidence
   - User marks "AI predicted correctly" → increases confidence

2. **Anomaly Detection**
   - If net weight suddenly ±30% from average → alert user
   - If temperature reads 25°C for frozen product → warning

3. **Seasonal Patterns**
   - Learn that Supplier X's ASA RESF varies by season
   - Predict expiration dates based on season

4. **Weight Distribution**
   - Instead of just averages, track distribution
   - "Most readings are 15-16kg, but sometimes 18kg"

5. **Photo Quality Scoring**
   - Train model to rate photo clarity
   - If photo blurry → lower confidence in extraction

6. **Batch-level Patterns**
   - Learn typical values per batch number
   - "Batch XYZ usually weighs 15kg"

---

## Code Integration Points

### In `types.ts`
- ✅ `ImageReading` interface added
- ✅ `LearningPattern` interface added
- ✅ `KnowledgeBase` updated with new fields

### In `services/storageService.ts`
- ✅ `storeImageReading(reading)` - Store new reading
- ✅ `predictFromReadings(supplier, product)` - Get predictions
- ✅ `getPatternsByProduct(product)` - Get all patterns for product
- ✅ `getRecentReadings(supplier, product, limit)` - Get reading history
- ✅ `getKnowledgeBase()` - Enhanced to initialize new fields

### In `components/WeighingForm.tsx`
- ✅ Import `ImageReading` type
- ✅ Import `storeImageReading`, `predictFromReadings`
- ✅ Create `ImageReading` object after Gemini extraction
- ✅ Call `storeImageReading()` to save
- ✅ Call `predictFromReadings()` to populate fields
- ✅ Display learning feedback: "🧠 Basado en X lecturas previas"

---

## Testing the System

### Test Case 1: Multiple readings of same product
1. Capture "Seara → ASA RESF" photo 1
2. Fill temperature: -12°C, weight: 15.2kg
3. Capture "Seara → ASA RESF" photo 2
4. **Expected:** Temperature auto-fills with -12°C ✓

### Test Case 2: Different products from same supplier
1. Capture "Seara → ASA RESF"
2. Capture "Seara → CARNE MOIDA" (different product)
3. Each should have different predictions ✓

### Test Case 3: Supplier comparison
1. Capture same product from Supplier A (5 times)
2. Capture same product from Supplier B (5 times)
3. Use `getPatternsByProduct()` to see differences ✓

---

## Commit Reference
- **Commit Hash:** 14a1144
- **Message:** "feat: Redesign AI learning system v2 - Store all image readings and create intelligent predictions"
- **Files Changed:**
  - `types.ts` - Added ImageReading, LearningPattern interfaces
  - `services/storageService.ts` - Implemented 4 new learning functions
  - `components/WeighingForm.tsx` - Integrated image reading storage and predictions

---

**Status:** ✅ Production Ready

The system is fully functional and automatically learns from every captured image. Users will see:
- Auto-filled fields based on learning
- Confidence indicators ("Basado en X lecturas")
- Smart predictions without any manual training
