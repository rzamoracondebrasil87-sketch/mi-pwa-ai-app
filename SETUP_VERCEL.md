# Configuración de Variables de Entorno en Vercel

Para que la app funcione correctamente en producción, debes configurar estas variables de entorno en Vercel:

## Pasos:

1. Abre tu proyecto en Vercel Dashboard: https://vercel.com/dashboard
2. Selecciona el proyecto `conferente-pro`
3. Dirígete a **Settings** → **Environment Variables**
4. Añade las siguientes variables (una por una):

### Variables a configurar:

| Variable | Valor |
|----------|-------|
| `VITE_GOOGLE_VISION_KEY` | `AQ.Ab8RN6LLKNZQ7YZbRhPOF427QmPwV77whkHw-oUfH9USx4AQpA` |
| `VITE_GEMINI_API_KEYS` | `AIzaSyAqCPmK9_s1Ec5jmFXWnyFmPpFIxuoMBVc,AIzaSyBS6tjO2_y4qq90clIZGgdr9SZwXu2guO4,AIzaSyDX-MI2CRlZm-7jypE_cvaMmau07QtNg7A` |

## Instrucciones detalladas:

1. En cada variable, selecciona los Environments donde aplica (Production, Preview, Development)
2. Copia el valor exactamente como aparece en la tabla arriba
3. Haz clic en **Save** después de cada una
4. Una vez guardadas, espera a que Vercel redeploy automáticamente (o fuerza manualmente)

## Cómo funciona después de configurar:

- **Google Vision API** se intenta primero (mejor OCR)
- Si Vision falla, intenta **Gemini** rotando entre las 3 claves configuradas
- Si ambas fallan, usa **OCR offline** (Tesseract) como último recurso

## Verificación:

Abre la URL de tu app en Vercel y sube una foto. Abre la consola del navegador (F12) para ver logs de cuál API se está usando.
