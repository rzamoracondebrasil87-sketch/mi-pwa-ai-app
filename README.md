# 🤖 Mi PWA AI App

Una aplicación web progresiva (PWA) totalmente instalable desde el navegador, potenciada por **Gemini 2.0 Flash** para optimizar tu trabajo.

## ✨ Características

- **📱 PWA Instalable**: Instala como una app nativa en cualquier dispositivo
- **🤖 IA Integrada**: Gemini 2.0 Flash para análisis inteligentes
- **🔌 Offline Ready**: Funciona sin conexión a internet
- **⚡ Rápida y Moderna**: Vite + React 19
- **🎨 Responsive**: Diseño adaptable
- **🔒 Segura**: API Key protegida

## 🚀 Quick Start

### Requisitos
- Node.js 16+

### Instalación

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev
```

Abre http://localhost:3000

### Compilar para Producción

```bash
npm run build
npm run preview
```

## 📦 Despliegue en Vercel

Ver [DEPLOYMENT.md](./DEPLOYMENT.md) para guía completa

```bash
git push origin main
# ¡Vercel se despliega automáticamente!
```

## 🤖 Usar Gemini AI en tu código

```typescript
import { callGeminiAPI, analyzeImageWithGemini } from './services/geminiService';

// Chat simple
const respuesta = await callGeminiAPI('Tu pregunta aquí');

// Analizar imagen
const analisis = await analyzeImageWithGemini(imagenBase64, 'Analiza esta imagen');
```

## 📂 Estructura

```
├── components/       # Componentes React
├── services/        # Gemini, Storage, i18n
├── vite.config.ts   # PWA config
├── manifest.json    # Metadatos PWA
├── .env.local       # Variables privadas ⚠️
└── sw.js            # Service Worker
```

## 🔐 Seguridad

✅ API Key en `.env.local` (gitignored)
✅ Nunca se expone en cliente
✅ Variables de entorno en Vercel

## 📝 Licencia

MIT - Autor: visualstudiobrasil26-design
