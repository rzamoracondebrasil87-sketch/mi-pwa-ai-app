# OCR Offline - Mejorado 🚀

## Cambios Implementados

La función `parseOCRText` en `components/WeighingForm.tsx` ahora usa un **módulo de interpretación OCR especializado** que sigue estas reglas:

### 1. **Detección de Fechas Mejorada**
- ✅ Detecta múltiples formatos: `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YY`
- ✅ Busca keywords: FAB, FABR, PROD, MAN (manufactura) y VAL, VENC, EXP (vencimiento)
- ✅ Fecha más antigua → fecha de fabricación
- ✅ Fecha más reciente → fecha de vencimiento
- ✅ Normaliza a formato: `DD/MM/YYYY`

### 2. **Detección de Lote/Batch**
- ✅ Prioridad 1: Busca keywords `LOT`, `LOTE`, `L:`, `BATCH`
- ✅ Prioridad 2: Detecta tokens alfanuméricos de 3-15 caracteres
- ✅ Ignora números puros
- ✅ Devuelve en mayúsculas

### 3. **Detección de Tara**
- ✅ Prioridad 1: Busca keyword `TARA`, `T:`, `EMB`, `PACKAGING`
- ✅ Prioridad 2: Encuentra el número más pequeño entre pesos detectados
- ✅ Normaliza a kilos automáticamente
- ✅ Rango válido: 0-100 kg

### 4. **Detección de Proveedor**
- ✅ Busca keywords: `MARCA`, `FORNECEDOR`, `SUPPLIER`, `BRAND`, `FABRICANTE`
- ✅ Si no encontrado, usa primera línea no-numérica
- ✅ Rango: 2-50 caracteres

### 5. **Detección de Producto**
- ✅ Descarta líneas con keywords de etiqueta
- ✅ Descarta líneas solo numéricas
- ✅ Puntúa por: número de palabras, longitud, penaliza dígitos
- ✅ Elige la línea con mejor puntuación

### 6. **Score de Confianza**
Cada campo extrae puntos:
- Producto: +25%
- Proveedor: +20%
- Lote: +15%
- Fecha fabricación: +15%
- Fecha vencimiento: +15%
- Tara: +10%

**Total: 0-100%**

## Estructura de Salida

```json
{
  "product": "Filé de Peito",
  "supplier": "Sadia",
  "batch": "L2309A",
  "manufacturing_date": "18/09/2025",
  "expiration_date": "18/03/2026",
  "tare_kg": 0.400,
  "confidence": 85
}
```

## Feedback al Usuario

El app ahora muestra:
```
✅ Muy confiable (OCR: 85%). Datos offline detectados.
⚠️ Revisar (OCR: 60%). Baja confianza.
❓ Baja confianza (OCR: 30%). Copie manualmente.
```

## Cómo Funciona en la App

1. **Usuario toma foto** o sube imagen
2. **Tesseract extrae texto crudo**
3. **ocrInterpret() analiza inteligentemente:**
   - Busca palabras clave
   - Aplica heurísticas contextuales
   - Calcula confianza
4. **parseOCRText() rellena el formulario**
5. **Usuario ve mensaje de confianza** y puede revisar/editar

## Ejemplo Real

### Entrada (OCR crudo):
```
ASA RESFRIADA
SADIA
LOTE: L2309A
FABRICAÇÃO: 18/09/2025
VALIDADE: 18/03/2026
TARA: 400g
PESO BRUTO: 10.2kg
```

### Salida (interpretada):
```json
{
  "product": "ASA RESFRIADA",
  "supplier": "SADIA",
  "batch": "L2309A",
  "manufacturing_date": "18/09/2025",
  "expiration_date": "18/03/2026",
  "tare_kg": 0.4,
  "confidence": 100
}
```

## Mejoras sobre versión anterior

| Aspecto | Antes | Ahora |
|--------|-------|-------|
| Detección de fechas | Básica | Múltiples keywords + prioridad inteligente |
| Confianza en resultados | No reportada | Score 0-100% |
| Normalización | Parcial | Completa (fechas, pesos) |
| Manejo de errores | Simple | Robusto con fallbacks |
| Feedback al usuario | Genérico | Específico con confianza |

## Próximas Mejoras (Opcionales)

- [ ] Aprender de correcciones del usuario
- [ ] Guardar patrones locales por proveedor
- [ ] Machine learning para scoring dinámico
- [ ] OCR con Google Vision (cuando se configure)

## Cómo Probar

1. Abre la app
2. Toma foto de una etiqueta de producto
3. Mira la consola del navegador:
   ```
   OCR Interpretation Result: { product: "...", confidence: 85 }
   ```
4. Verifica que los campos se llenan correctamente
5. Revisa el mensaje de confianza

## Debugging

Si OCR no funciona bien:
1. **Consola del navegador** → busca "OCR Interpretation Result"
2. **Verifica entrada raw** → Tesseract está extrayendo bien?
3. **Revisa confidence score** → Es muy bajo?
4. **Comprueba regexes** → Coinciden con tu formato?

## Contacto

Si encuentras etiquetas que no funcionan bien, reporta:
- Copia del texto OCR crudo
- Campos que faltaron
- Score de confianza esperado

¡La calidad mejora con cada caso real!
