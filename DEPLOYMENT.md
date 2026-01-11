# 🚀 Guía de Despliegue - Mi PWA AI App

## Paso 1: Preparar GitHub

### 1.1 Clonar el repositorio localmente
```bash
git clone https://github.com/visualstudiobrasil26-design/mi-pwa-ai-app.git
cd mi-pwa-ai-app
```

### 1.2 Copiar archivos existentes
Copia todos los archivos de `e:\conferente-pro` EXCEPTO:
- `.git` (si existe)
- `node_modules`
- `dist`

### 1.3 Hacer push a GitHub
```bash
git add .
git commit -m "🚀 Init: PWA con Gemini AI"
git push -u origin main
```

---

## Paso 2: Configurar en Vercel

### 2.1 Conectar repositorio
1. Ve a https://vercel.com/new
2. Importa tu repositorio `mi-pwa-ai-app`
3. Framework: **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`

### 2.2 Agregar variables de entorno
En la pantalla de environment variables, agrega:

**Key:** `VITE_GEMINI_API_KEY`
**Value:** `<REDACTED - configure VITE_GEMINI_API_KEY in .env.local or Vercel Environment Variables>`

### 2.3 Desplegar
Click en **Deploy** y espera a que termine.

---

## Paso 3: Configuración Local

### 3.1 Instalar dependencias
```bash
npm install
```

### 3.2 Variables de entorno
El archivo `.env.local` ya existe con la API key.

### 3.3 Ejecutar localmente
```bash
npm run dev
```

Abre http://localhost:3000

---

## Paso 4: Instalar PWA

1. Abre tu app en Vercel o localmente
2. En Chrome/Edge: Click en el ícono de instalación (arriba a la derecha)
3. O usa el menú: **Más > Instalar app**

---

## 📋 Archivos Importantes

- `.env.local` - API Key (nunca hacer push)
- `.gitignore` - Excluye archivos sensibles
- `vercel.json` - Configuración de Vercel
- `vite.config.ts` - Configuración PWA
- `manifest.json` - Metadatos de la app
- `services/geminiService.ts` - Cliente de Gemini API

---

## 🔑 Seguridad

✅ API Key guardada en `.env.local` (no en git)
✅ Vercel tiene variables privadas seguras
✅ Service Worker cachea llamadas a Gemini
✅ Totalmente funcional offline

---

## 🐛 Troubleshooting

**"GEMINI_API_KEY no está configurada"**
- Verifica que `.env.local` existe
- Reinicia `npm run dev`

**PWA no se instala**
- Necesita HTTPS (Vercel automático, localhost puede requerir https)
- Limpia caché del navegador

**Error en Gemini API**
- Verifica que la API key sea válida
- Comprueba límites de cuota en Google Cloud Console

---

Crear por: GitHub Copilot
Fecha: 2026-01-11
