# 🤖 Mi PWA AI App

Una aplicación web progresiva (PWA) totalmente instalable desde el navegador, potenciada por la IA de **Gemini 2.0 Flash** para optimizar tu trabajo.

## ✨ Características

- **📱 PWA Instalable**: Instala como una app nativa en tu dispositivo
- **🤖 IA Integrada**: Usa Gemini 2.0 Flash para análisis inteligentes
- **🔌 Offline Ready**: Funciona sin conexión a internet
- **⚡ Rápida**: Optimizada con Vite y React 19
- **🎨 Responsive**: Diseño adaptable a cualquier pantalla
- **🔒 Segura**: API Key protegida con variables de entorno

## 🚀 Quick Start

### Requisitos
- Node.js 16+ 
- npm o yarn

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/visualstudiobrasil26-design/mi-pwa-ai-app.git
cd mi-pwa-ai-app

# Instalar dependencias
npm install

# Configurar API Key (ya viene en .env.local)
# Edita .env.local si necesitas cambiarla

# Ejecutar en desarrollo
npm run dev
```

Abre http://localhost:3000 en tu navegador.

## 🔧 Compilar para Producción

```bash
npm run build
npm run preview
```

## 📦 Despliegue en Vercel

Ver [DEPLOYMENT.md](./DEPLOYMENT.md) para instrucciones completas.

```bash
git push
# Vercel se despliega automáticamente
```

## 📂 Estructura del Proyecto

```
├── components/          # Componentes React
├── services/           # Servicios (Gemini, Storage, etc)
├── vite.config.ts      # Config PWA
├── manifest.json       # Metadatos PWA
├── .env.local          # Variables privadas
└── public/             # Assets estáticos
```

## 🤖 Usar Gemini AI

```typescript
import { callGeminiAPI } from './services/geminiService';

const response = await callGeminiAPI('Tu pregunta aquí');
console.log(response); // Respuesta de IA
```

## 🔐 Seguridad

- La API Key está en `.env.local` (gitignored)
- Nunca se expone en el cliente
- Vercel usa secrets para producción

## 🎯 Roadmap

- [ ] Análisis de imágenes con OCR
- [ ] Chat en tiempo real
- [ ] Historial persistente
- [ ] Múltiples idiomas
- [ ] Themes personalizados

## 📝 Licencia

MIT

---

**Autor**: visualstudiobrasil26-design  
**Creado**: 2026-01-11  
**Estado**: 🚀 En Producción
