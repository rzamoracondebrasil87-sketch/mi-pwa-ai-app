#!/bin/bash
# Script de inicialización de Git para mi-pwa-ai-app
# Ejecuta esto desde la raíz del proyecto

echo "🚀 Inicializando repositorio git..."

# Inicializar git si no existe
if [ ! -d ".git" ]; then
  git init
  git branch -M main
fi

# Agregar todos los archivos
git add .

# Crear primer commit
git commit -m "🚀 Init: PWA AI App con Gemini 2.0 Flash

- Configuración PWA completa
- Integración segura de Gemini API
- Variables de entorno protegidas
- Ready para Vercel"

# Agregar remote (cambiar usuario y repo según corresponda)
git remote remove origin 2>/dev/null
git remote add origin https://github.com/visualstudiobrasil26-design/mi-pwa-ai-app.git

# Hacer push
echo ""
echo "📤 Haciendo push a GitHub..."
echo "Usa tu token de GitHub como contraseña si te lo pide"
echo ""

git push -u origin main

echo ""
echo "✅ ¡Push completado!"
echo ""
echo "Próximos pasos:"
echo "1. Ve a https://vercel.com/new"
echo "2. Importa tu repositorio"
echo "3. Configura la variable VITE_GEMINI_API_KEY"
echo "4. ¡Despliega!"
