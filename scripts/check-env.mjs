import fs from 'fs';
import path from 'path';

// Verificar que las variables críticas existan en tiempo de build
const requiredVars = [
  'GOOGLE_CLOUD_CREDENTIALS',
  'VITE_GEMINI_API_KEY',
  'VITE_GEMINI_API_KEYS',
  'VITE_GOOGLE_VISION_KEY'
];

console.log('\n📋 Verificando variables de entorno en build time...\n');

const missing = [];
for (const varName of requiredVars) {
  const value = process.env[varName];
  if (!value) {
    missing.push(varName);
    console.log(`❌ ${varName}: NO CONFIGURADA`);
  } else {
    const preview = value.substring(0, 20) + (value.length > 20 ? '...' : '');
    console.log(`✅ ${varName}: ${preview}`);
  }
}

if (missing.length > 0) {
  console.log(`\n⚠️  ADVERTENCIA: ${missing.length} variable(s) de entorno faltante(s)`);
  console.log('Variables faltantes:', missing.join(', '));
  console.log('\nNota: Las variables no prefixadas con VITE_ se cargarán en serverless functions');
} else {
  console.log('\n✅ Todas las variables de entorno están configuradas!\n');
}
