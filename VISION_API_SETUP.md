# Google Cloud Vision API Setup Guide

## Overview
The app uses Google Cloud Vision API for OCR text detection. Due to Vision API authentication requirements (OAuth2/Service Account), we've implemented a backend endpoint on Vercel that handles the authentication securely.

## Architecture
```
Client (WeighingForm.tsx)
    ↓ fetch POST /api/vision
Vercel Function (api/vision.ts)
    ↓ uses @google-cloud/vision SDK
Google Cloud Vision API
```

## Prerequisites
1. Google Cloud project with Vision API enabled
2. Service Account with Vision API permissions
3. Vercel deployment (already set up)

## Step 1: Create Service Account in Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to: **APIs & Services** → **Service Accounts**
4. Click **Create Service Account**
   - Service account name: `vision-app-service`
   - Description: `Service account for PWA Vision API`
   - Click **Create and Continue**
5. Grant roles:
   - Select: **Cloud Vision API User**
   - Click **Continue** and **Done**

## Step 2: Create and Download JSON Key

1. In the Service Accounts list, click the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON** format
5. Click **Create** (JSON file downloads automatically)
   - **SAVE THIS FILE SECURELY** - it contains credentials
   - File will be named like: `project-id-xxxxx.json`

## Step 3: Encode Service Account JSON for Vercel

The JSON file contains special characters, so we encode it as base64 for the environment variable.

### On Windows (PowerShell):
```powershell
# Open the JSON file you downloaded
$jsonContent = Get-Content "C:\path\to\project-id-xxxxx.json" -Raw
$base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($jsonContent))
Write-Host $base64 | clip  # Copies to clipboard
```

### On Mac/Linux:
```bash
base64 -w 0 < /path/to/project-id-xxxxx.json | pbcopy  # Mac
# or
base64 -w 0 < /path/to/project-id-xxxxx.json | xclip -selection clipboard  # Linux
```

The output is a long base64 string. Copy the entire output.

## Step 4: Add to Vercel Environment

```bash
# From your project root
vercel env add GOOGLE_CLOUD_CREDENTIALS production
```

When prompted, paste the entire base64-encoded string you copied above.

## Step 5: Redeploy

```bash
vercel --prod
```

Wait for deployment to complete. The `GOOGLE_CLOUD_CREDENTIALS` variable is now available to the `/api/vision` endpoint.

## Step 6: Test the Integration

1. Go to your deployed app: `https://conferente-pro.vercel.app`
2. Upload or take a photo of a product label
3. The app will:
   - First attempt Vision API via `/api/vision`
   - If successful, extract OCR text
   - If not, fall back to Gemini or offline OCR

Check browser console for logs:
```
Attempting Google Vision API...
Vision API Text: [full text from image]
```

## Troubleshooting

### GOOGLE_CLOUD_CREDENTIALS not configured
**Error**: `Vision API error: Vision credentials not configured`

**Solution**: 
- Confirm you ran `vercel env add GOOGLE_CLOUD_CREDENTIALS production`
- Verify the base64 string was pasted completely (should be ~3000+ characters)
- Redeploy with `vercel --prod`

### 401 Unauthorized
**Error**: `Error: 7 PERMISSION_DENIED: Permission denied`

**Causes**:
1. Service Account doesn't have "Cloud Vision API User" role
2. Vision API not enabled in Google Cloud project
3. base64-encoded JSON is corrupted

**Solution**:
- Go to Google Cloud Console → IAM & Admin → IAM Roles
- Find your service account, verify it has "Cloud Vision API User"
- Go to APIs & Services → Enabled APIs
- Search for "Vision API" and enable if not listed

### Image not being read
**Check**:
1. Browser console for errors
2. Vercel function logs: `vercel logs` or Vercel dashboard
3. Image format (JPEG, PNG, GIF supported)
4. Image size (max ~20MB)

## How It Works

### Client-side (WeighingForm.tsx)
```typescript
const analyzeImageContent = async (base64Image: string) => {
  // 1. Try Vision API via backend
  const visionText = await analyzeImageWithVision(base64);
  // 2. If that fails, try Gemini
  // 3. If that fails, use offline OCR
};
```

### Service (visionService.ts)
```typescript
export async function analyzeImageWithVision(base64Image: string): Promise<string> {
  const response = await fetch('/api/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64Image }),
  });
  
  const data = await response.json();
  return data.text || '';
}
```

### Backend Endpoint (api/vision.ts)
```typescript
// 1. Reads GOOGLE_CLOUD_CREDENTIALS from environment
// 2. Decodes base64 → JSON credentials
// 3. Creates Vision client with credentials
// 4. Calls textDetection on image
// 5. Returns extracted text
```

## Architecture Benefits

- **Security**: Service Account key never exposed to client
- **Scalability**: Vercel handles serverless scaling
- **Resilience**: OCR pipeline has 3 fallbacks (Vision → Gemini → Tesseract)
- **Flexibility**: Easy to swap providers or add new ones

## Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `GOOGLE_CLOUD_CREDENTIALS` | Vercel (production only) | Base64-encoded Service Account JSON |
| `VITE_GEMINI_API_KEYS` | Vercel (production) | Comma-separated Gemini API keys |
| `VITE_GOOGLE_VISION_KEY` | Vercel (deprecated) | Old API key approach (no longer used) |

## Next Steps

1. Create Service Account in Google Cloud (Steps 1-2)
2. Encode JSON as base64 (Step 3)
3. Add to Vercel (Step 4)
4. Redeploy (Step 5)
5. Test (Step 6)

Questions? Check the browser console and Vercel function logs for detailed error messages.
