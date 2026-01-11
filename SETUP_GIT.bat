@echo off
REM Script de inicialización de Git para mi-pwa-ai-app (Windows)
REM Ejecuta esto desde la raíz del proyecto

echo.
echo 🚀 Inicializando repositorio git...
echo.

REM Inicializar git si no existe
if not exist ".git" (
  git init
  git branch -M main
)

REM Agregar todos los archivos
git add .

REM Crear primer commit
git commit -m "🚀 Init: PWA AI App con Gemini 2.0 Flash - Configuración PWA completa - Integración segura de Gemini API - Variables de entorno protegidas - Ready para Vercel"

REM Agregar remote
git remote remove origin 2>nul
git remote add origin https://github.com/visualstudiobrasil26-design/mi-pwa-ai-app.git

REM Hacer push
echo.
echo 📤 Haciendo push a GitHub...
echo Usa tu token de GitHub como contraseña si te lo pide
echo.

git push -u origin main

echo.
echo ✅ Push completado!
echo.
echo Próximos pasos:
echo 1. Ve a https://vercel.com/new
echo 2. Importa tu repositorio
echo 3. Configura la variable VITE_GEMINI_API_KEY
echo 4. ¡Despliega!
echo.
pause
