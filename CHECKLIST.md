# 📋 Checklist de Instalación y Despliegue

## ✅ Lo que ya está hecho:

- [x] Proyecto configurado con React 19 + Vite 6
- [x] PWA totalmente funcional (manifest + service worker)
- [x] Gemini API v1beta integrada y segura
- [x] Variables de entorno en `.env.local`
- [x] `.gitignore` configurado para ocultar secretos
- [x] `package.json` actualizado
- [x] `vercel.json` listo para despliegue
- [x] Dependencias instaladas (`npm install`)

## 🚀 Pasos para desplegar:

### Paso 1: Inicializar Git y hacer Push

**Opción A: Windows (Recomendado)**
```bash
# Ejecuta este archivo:
.\SETUP_GIT.bat
```

**Opción B: MacOS/Linux**
```bash
# Ejecuta este archivo:
chmod +x SETUP_GIT.sh
./SETUP_GIT.sh
```

**Opción C: Manual (Cualquier sistema)**
```bash
git init
git add .
git commit -m "🚀 Init: PWA AI App con Gemini"
git branch -M main
git remote add origin https://github.com/visualstudiobrasil26-design/mi-pwa-ai-app.git
git push -u origin main
```

### Paso 2: Configurar Vercel

1. Ve a https://vercel.com/new
2. Haz clic en **Import Git Repository**
3. Selecciona tu repositorio `mi-pwa-ai-app`
4. Click en **Import**

En la pantalla de configuración:

- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

Haz clic en **Environment Variables** y agrega:

| Key | Value |
|-----|-------|
| `VITE_GEMINI_API_KEY` | `<REDACTED - configure in Vercel Environment Variables>` |

Click en **Deploy** y espera a que termine (2-3 minutos).

### Paso 3: Probar la app

Una vez desplegada en Vercel:

1. Haz clic en la URL que genera Vercel
2. Debería abrirse tu PWA AI App
3. Prueba el chat con IA
4. Intenta instalarla desde el navegador (ícono de instalación)

## 🧪 Probar localmente

```bash
# Desarrollo (hot reload)
npm run dev

# Compilar para producción
npm run build

# Vista previa de producción
npm run preview
```

## 🔐 Variables de Entorno

- **Local**: Usa `.env.local` (ignorada en git) ✅
- **Vercel**: Configura en Settings > Environment Variables ✅
- **API Key**: Nunca expongas en el código ✅

## 📱 Instalar como PWA

Una vez desplegada:

1. **Chrome/Edge**: Click en el ícono de instalación (arriba a la derecha)
2. **Safari (iOS)**: Comparte > Agregar a Pantalla de inicio
3. **Firefox**: Click en el menú ⋯ > Instalar app

## ✨ ¿Qué hace tu PWA?

Tu aplicación es un asistente de IA con:

- Chat en tiempo real con Gemini
- Análisis de imágenes
- Almacenamiento local de datos
- Funciona completamente offline
- Instalable en cualquier dispositivo
- Rápido y responsive

## 🆘 Si algo falla:

**"Module not found"**
```bash
npm install --legacy-peer-deps
```

**"API Key no configurada"**
- Verifica `.env.local` contiene `VITE_GEMINI_API_KEY`
- Reinicia `npm run dev`

**PWA no se instala**
- Necesita HTTPS (Vercel lo proporciona automáticamente)
- Limpia caché del navegador

## 📞 Soporte

Ver [DEPLOYMENT.md](./DEPLOYMENT.md) para más detalles.

---

**¡Listo para desplegar! 🚀**

Autor: GitHub Copilot
Fecha: 2026-01-11
