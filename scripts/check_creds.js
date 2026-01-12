const fs = require('fs');
const path = require('path');

try {
  const p = path.join(__dirname, '..', 'credentials_base64.txt');
  const b64 = fs.readFileSync(p, 'utf8').trim();
  const jsonStr = Buffer.from(b64, 'base64').toString('utf8');
  const obj = JSON.parse(jsonStr);

  const keys = Object.keys(obj);
  const hasClientEmail = typeof obj.client_email === 'string';
  const hasPrivateKey = typeof obj.private_key === 'string';
  const hasClientId = typeof obj.client_id === 'string';

  const maskedEmail = hasClientEmail ? obj.client_email.replace(/^(.{2}).+@/, '$1***@') : '(none)';

  console.log('CREDENCIALS_OK:true');
  console.log('keys=' + keys.join(','));
  console.log('client_email=' + maskedEmail);
  console.log('has_private_key=' + (hasPrivateKey ? 'true' : 'false'));
  console.log('has_client_id=' + (hasClientId ? 'true' : 'false'));
}catch(err){
  console.error('CREDENCIALS_OK:false');
  console.error(err && err.message);
  process.exit(1);
}
