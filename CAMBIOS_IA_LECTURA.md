# Cambios en el Sistema de IA para Lectura de Etiquetas

## Resumen de Cambios

Se han realizado los siguientes cambios para mejorar el comportamiento del sistema de IA al leer etiquetas de productos:

### 1. **Campos Vacíos en lugar de "Indeterminado"**
   - **Archivo:** `api/vision.ts`
   - **Cambio:** Cuando la IA no puede leer un campo (fornecedor, lote, tipo, código de barras, etc.), ahora devuelve un string vacío (`""`) en lugar de `"indeterminado"`
   - **Beneficio:** El historial solo muestra información real, sin ruido de valores por defecto. Los campos vacíos son ignorados automáticamente.

### 2. **Historial Optimizado**
   - **Archivo:** `components/WeighingForm.tsx`
   - **Cambio:** El resumen guardado en `extractedPhotoInfo` ahora incluye SOLO los datos especificados:
     - Data de fabricação
     - Data de vencimento
     - Lote
     - Tara usada para el pesaje
   - **Formato:** `"Fab: DD/MM/AAAA | Vto: DD/MM/AAAA | Lote: XXXXX | Tara: X.XXkg"`
   - **Beneficio:** El historial es limpio, conciso y enfocado en los datos críticos.

### 3. **Lógica de Alertas de Vencimiento Mejorada**
   - **Archivo:** `components/WeighingForm.tsx`
   - **Cambio en checkExpirationRisk():**
     - **Congelado:** Sin alertas (vida útil > 1 año)
     - **Resfriado:** Alerta si vence en ≤ 2 días
     - **Fresco:** Alerta si vence hoy o mañana
     - **Desconocido/Tipo no especificado:** Alerta si vence en ≤ **15 días** (antes era 7 días)
   - **Lógica:** La IA necesita aprender que muchos productos se venden rápidamente o se recibe poca mercancía. No debe adivinar con umbrales agresivos.
   - **Nota:** A menos que sea una carta de vencimiento muy corto, no debe alertar antes de 15 días.

### 4. **Validación de Fechas**
   - **Archivo:** `api/vision.ts`
   - **Cambio:** Las validaciones de fechas ahora verifican si los campos existen y tienen contenido, no comparan con `"indeterminado"`
   - **Beneficio:** Evita errores de procesamiento de strings vacíos.

### 5. **Filtrado en Knowledge Base**
   - **Archivo:** `services/storageService.ts`
   - **Cambio:** 
     - `calculateCommonType()` ahora filtra strings vacíos en lugar de `"indeterminado"`
     - `getProductType()` devuelve string vacío si no hay tipo aprendido
   - **Beneficio:** El sistema de aprendizaje es más limpio y consistente.

## Impacto en el Flujo

### Antes
```
Etiqueta ilegible → "Fornecedor: indeterminado, Lote: indeterminado, Tipo: indeterminado"
→ Historial sucio con valores sin sentido
```

### Después
```
Etiqueta ilegible → "" (campos vacíos)
→ Solo muestra: "Fab: 10/01/26 | Vto: 10/02/26 | Lote: A123"
→ Historial limpio y legible
```

## Excepciones de Alertas de Vencimiento

La IA ahora entiende mejor cuándo alertar:

- **15 días para productos de tipo desconocido:** Aprende a no sobrealerta
- **Solo 2 días para resfriados:** Productos críticos de vida corta
- **Expirados:** Siempre alerta
- **Congelados:** Raramente alerta (vida útil larga)

## Recomendaciones

1. **Enseñar a la IA:** Etiqueta manualmente los productos con su tipo (congelado, resfriado, fresco) para que aprenda mejor
2. **Monitoreo:** Observa las alertas y ajusta umbrales si es necesario
3. **Validación Manual:** Verifica ocasionalmente que los datos extraídos sean correctos

---
**Fecha:** 13 de Enero de 2026
**Estado:** Implementado y testeado
