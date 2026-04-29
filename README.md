# Wedding Gallery Backend

AI-powered photo gallery that matches guests to their photos using face detection.

## Quick Start

### 1. Local Setup

```bash
npm install
```

### 2. Download Face Detection Models

Create `models/` folder and download these 6 files from: 
`https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/`

- `ssd_mobilenetv1_model-weights_manifest.json`
- `ssd_mobilenetv1_model.weights.bin`
- `face_landmark_68_model-weights_manifest.json`
- `face_landmark_68_model.weights.bin`
- `face_recognition_model-weights_manifest.json`
- `face_recognition_model.weights.bin`

### 3. Setup .env

```bash
cp .env.example .env
```

Fill in:
- `ANTHROPIC_API_KEY` - from https://console.anthropic.com
- `GOOGLE_CREDENTIALS_JSON` - from Google Cloud (copy entire JSON)
- `DATABASE_URL` - PostgreSQL connection string (local: `postgresql://localhost/wedding_gallery`)

### 4. Run Locally

```bash
npm start
```

Server starts at `http://localhost:3000`

## Deployment to Render

### Step 1: Create GitHub Repository

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/wedding-gallery-backend.git
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to https://render.com
2. Click **New** → **Blueprint**
3. Connect your GitHub repository
4. Render reads `render.yaml` and auto-creates PostgreSQL + Web Service

### Step 3: Add Environment Variables

In Render Dashboard:
1. Open your **Web Service**
2. Go to **Environment**
3. Add:
   - `ANTHROPIC_API_KEY` = your Claude API key
   - `GOOGLE_CREDENTIALS_JSON` = your Google credentials JSON (paste entire file content)

### Step 4: Database Initialization

Render runs `preDeployCommand` in render.yaml which:
- Creates PostgreSQL database
- Installs pgvector extension
- Creates `users`, `event_photos`, `detected_faces` tables

## API Endpoints

### 1. Register User Face
```bash
POST /api/register
Content-Type: application/json

{
  "userId": "guest123",
  "selfieBase64": "base64_encoded_image"
}
```

### 2. Sync Google Drive Folder
```bash
POST /api/sync-drive
Content-Type: application/json

{
  "folderId": "YOUR_GOOGLE_DRIVE_FOLDER_ID"
}
```

**Note:** Your Google Service Account email must have "Viewer" access to this folder.

### 3. Get User's Matched Photos
```bash
GET /api/photos/:userId
```

Returns array of matched photos with thumbnails and AI tags.

## How It Works

1. **Guest uploads selfie** → Face converted to 128D vector
2. **Photos dropped in Drive folder** → Server downloads and extracts all faces
3. **Claude AI tags** each photo (clothing, setting, etc.)
4. **Face vectors compared** → Matches returned with threshold 0.45
5. **Guest sees personalized gallery** → Only their photos shown

## Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | `production` or `development` |
| `ANTHROPIC_API_KEY` | Claude API key from Anthropic console |
| `GOOGLE_CREDENTIALS_JSON` | Full Google Service Account JSON |
| `DATABASE_URL` | PostgreSQL connection string |

## Troubleshooting

**Models not loading?** 
- Ensure all 6 files are in `models/` folder
- Check file names exactly

**Face detection failing?**
- Image quality must be good
- Face must be clearly visible
- Try higher quality selfie

**Photos not matching?**
- Ensure Google Service Account has access to folder
- Check folder ID is correct
- Run `/api/sync-drive` after adding photos to Drive

## Architecture

```
┌─────────────────────┐
│  React Frontend     │
│ (Netlify)           │
└──────────┬──────────┘
           │
           ├─ POST /api/register (selfie)
           ├─ POST /api/sync-drive (trigger)
           └─ GET /api/photos/:userId (results)
           │
┌──────────v──────────────────┐
│  Express Backend (Render)    │
│  ┌────────────────────────┐  │
│  │ galleryService.js      │  │
│  │ - Face Detection       │  │
│  │ - Claude AI Tagging    │  │
│  │ - Google Drive Sync    │  │
│  └────────────────────────┘  │
└──────────┬───────────────────┘
           │
           ├─ PostgreSQL + pgvector
           ├─ Google Drive API
           └─ Claude API
```
