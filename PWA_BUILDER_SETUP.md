# Configuración PWA Builder - Conferente Pro

## Problema Resuelto
Se han eliminado los iconos duplicados y se han configurado correctamente los iconos de PWA Builder:

### Antes
- `vite.config.ts`: Iconos locales `/pwa-192x192.png` y `/pwa-512x512.png` (que no existían)
- `manifest.json`: SVG embebido y placeholder `picsum.photos`
- **Duplicación**: Los mismos iconos aparecían 3 veces en la configuración

### Ahora
- Ambos archivos usan iconos de PWA Builder:
  - `https://www.pwabuilder.com/assets/icons/icon_192.png` (any)
  - `https://www.pwabuilder.com/assets/icons/icon_512.png` (maskable)
- Sin duplicación
- Nombres consistentes: "Conferente Pro"

## Paso a Paso: Publicar en PWA Builder

### 1. Desplegar la app en una URL pública
```bash
# Si usas Vercel:
vercel deploy

# Si usas otra plataforma, asegúrate de que tu app esté disponible en https://
```

### 2. Ir a PWA Builder
https://www.pwabuilder.com

### 3. Ingresar la URL de tu app
1. Coloca la URL pública en el campo "Enter your app URL"
2. Click en "Get Started" o "Analyze"

### 4. Revisar y completar el manifest
PWA Builder detectará automáticamente:
- ✅ `manifest.json` (ya configurado)
- ✅ `sw.js` (ya implementado)
- ✅ Iconos (ahora desde PWA Builder)

### 5. Generar paquetes
PWA Builder te permitirá generar:
- **APK para Android** (Google Play)
- **MSIX para Windows** (Microsoft Store)
- **DMG para macOS**

### 6. Configuración recomendada
En la sección "Package Options" de PWA Builder:

**Para Android:**
- Mín SDK: 21 (Android 5.0)
- Orientación: portrait (ya configurado)
- Tema: #2563eb (ya configurado)

**Para Windows:**
- Nombre del Publisher: tu empresa
- Certificado: PWA Builder lo genera automáticamente

## Archivos Actualizados
- `manifest.json`: Iconos de PWA Builder, sin duplicación
- `vite.config.ts`: Sincronizado con `manifest.json`
- `sw.js`: Service Worker funcional (ya existía)

## Validación Local
```bash
# 1. Construir la app
npm run build

# 2. Servir localmente
npm run preview

# 3. Abrir en navegador
# http://localhost:4173

# 4. Verificar manifest
# Abre DevTools > Application > Manifest
```

## Checklist Antes de Enviar a PWA Builder
- [ ] URL pública desplegada y accesible
- [ ] `manifest.json` válido (descarga y valida con https://manifest-validator.appspot.com/)
- [ ] Service Worker registrado (`/sw.js`)
- [ ] Iconos 192x192 y 512x512 disponibles
- [ ] HTTPS habilitado (obligatorio)
- [ ] `theme_color: #2563eb` configurado
- [ ] `display: standalone` configurado

## Notas
- Los iconos de PWA Builder son genéricos. Para producción, reemplaza con tus propios iconos:
  1. Descarga tus iconos PNG
  2. Súbelos a tu servidor o CDN
  3. Actualiza las URLs en `manifest.json` y `vite.config.ts`

- Alternativa: Usa un CDN como Cloudinary o Imgix para servir los iconos

## Recursos
- [PWA Builder](https://www.pwabuilder.com)
- [Manifest Validator](https://manifest-validator.appspot.com/)
- [MDN Web Manifest](https://developer.mozilla.org/es/docs/Web/Manifest)
- [Web.dev PWA Guide](https://web.dev/progressive-web-apps/)
