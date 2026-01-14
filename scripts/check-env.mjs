const requiredEnvVars = [
    'GOOGLE_CLOUD_CREDENTIALS',
    'VITE_GOOGLE_VISION_KEY'
];

console.log('📋 Verificando variables de entorno en build time...\n');

let missingVars = [];
let presentVars = [];

requiredEnvVars.forEach(varName => {
    if (process.env[varName]) {
        console.log(`✅ ${varName}: CONFIGURADA`);
        presentVars.push(varName);
    } else {
        console.log(`❌ ${varName}: NO CONFIGURADA`);
        missingVars.push(varName);
    }
});

console.log(`\n${missingVars.length > 0 ? '⚠️  ADVERTENCIA:' : '✅ ÉXITO:'} ${missingVars.length + presentVars.length} variable(s) verificada(s)`);

if (missingVars.length > 0) {
    console.log(`Variables faltantes: ${missingVars.join(', ')}`);
    console.log('Nota: Las variables no prefixadas con VITE_ se cargarán en serverless functions');
}

if (missingVars.length > 0) {
    console.log('\n🔧 Para desarrollo local, crea un archivo .env con las variables faltantes.');
    console.log('🔧 Para producción, configura las variables en Vercel dashboard.');
}

// Exit with error if critical vars are missing
if (missingVars.length > 0) {
    console.log('\n❌ Build cancelado: Variables de entorno faltantes');
    process.exit(1);
}
