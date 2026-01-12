# Vision API Quick Setup (5 minutes)

## What You Need
- Google Cloud project
- Service Account JSON key file
- Vercel CLI installed

## Steps

### 1. Google Cloud: Create Service Account
```
Google Cloud Console
→ APIs & Services
→ Service Accounts
→ Create Service Account
  Name: vision-app-service
→ Grant role: Cloud Vision API User
→ Create Key (JSON format)
```
Save the JSON file.

### 2. Encode JSON
**Windows PowerShell:**
```powershell
$json = Get-Content "path\to\key.json" -Raw
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)) | clip
```

**Mac:**
```bash
base64 -w 0 < /path/to/key.json | pbcopy
```

### 3. Add to Vercel
```bash
vercel env add GOOGLE_CLOUD_CREDENTIALS production
# Paste the base64 string when prompted
```

### 4. Deploy
```bash
vercel --prod
```

## Done!
The Vision API endpoint `/api/vision` now works. The app will:
1. Try Vision API (best quality)
2. Fall back to Gemini (if Vision fails)
3. Fall back to offline OCR (if Gemini fails)

## Test
Upload an image in the app. Check browser console for logs.
