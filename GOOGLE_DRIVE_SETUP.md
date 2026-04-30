# Google Drive Integration Setup

This guide explains how to set up Google Drive storage for the Magic Gallery backend.

---

## 🎯 What Changed

✅ **Replaced Cloudinary** with Google Drive  
✅ **Backend now uploads** photos to Google Drive  
✅ **Frontend uploads** via backend endpoint  
✅ **All features work** with Google Drive URLs  

---

## 📋 Setup Steps

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project:
   - Click **"Select a Project"** → **"NEW PROJECT"**
   - Name: `Wedding Gallery`
   - Click **"CREATE"**
3. Wait for it to load and select the project

---

### Step 2: Enable Google Drive API

1. Go to **APIs & Services** → **Library**
2. Search for **"Google Drive API"**
3. Click it → **"ENABLE"**

---

### Step 3: Create Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **"+ CREATE CREDENTIALS"** → **"Service Account"**
3. Fill in:
   - Service account name: `wedding-gallery-uploader`
   - Click **"CREATE AND CONTINUE"**
4. Skip optional steps → **"DONE"**

---

### Step 4: Generate Service Account Key

1. In **Credentials** page, find your service account
2. Click on it
3. Go to **"KEYS"** tab
4. Click **"ADD KEY"** → **"Create new key"**
5. Choose **"JSON"**
6. Click **"CREATE"**
7. A file downloads automatically

---

### Step 5: Share Google Drive Folder

1. Open your Google Drive folder:
   ```
   https://drive.google.com/drive/folders/1BKIM0XbS7pmaj54A1T2_dVh9QYID8l_W
   ```

2. Right-click the folder → **"Share"**

3. In the JSON file you downloaded, find the line:
   ```
   "client_email": "wedding-gallery-uploader@project.iam.gserviceaccount.com"
   ```

4. Paste that email in the Share dialog

5. Give it **"Editor"** access

6. Click **"Share"**

---

### Step 6: Add Service Account Key to Backend

#### Local Development (`.env`)

1. Open the JSON file you downloaded
2. Copy the entire contents
3. In `wedding-gallery-backend/.env`, set:
   ```env
   GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
   ```
4. Paste the entire JSON as one line (remove newlines)

#### Railway Deployment

1. Go to Railway dashboard
2. Select **Wedding-Gallery-Backend** service
3. Go to **Variables**
4. Add new variable:
   - Key: `GOOGLE_SERVICE_ACCOUNT_KEY`
   - Value: (entire JSON from the file, as one line)
5. Click **"Save"**

---

### Step 7: Verify Configuration

Run the backend:
```bash
npm install
npm start
```

You should see:
```
✅ Google Drive API initialized
✅ Models loaded and database ready
```

---

## 📤 New API Endpoint

The backend now has a new upload endpoint:

```
POST /api/upload-photo
Content-Type: multipart/form-data

Body:
  photo: <binary file>

Response:
{
  "success": true,
  "fileId": "1ABC2DEF...",
  "downloadUrl": "https://drive.google.com/uc?export=download&id=1ABC2DEF...",
  "fileName": "wedding-2026-04-29-photo.jpg"
}
```

---

## 🖼️ Frontend Changes

The PhotoGallery component now:
1. ✅ Uploads photos via backend endpoint
2. ✅ Stores Google Drive URLs in Supabase
3. ✅ Displays photos from Google Drive
4. ✅ Removed all Cloudinary references

---

## ✨ How It Works

**User uploads photo** → **Frontend calls `/api/upload-photo`** → **Backend uploads to Google Drive** → **Gets download URL** → **Saves to Supabase** → **Appears in Photo Gallery**

---

## 🔍 Troubleshooting

### "Google Drive API not configured"
- Make sure `GOOGLE_SERVICE_ACCOUNT_KEY` is set in `.env` or Railway Variables
- Check that the JSON is valid (one line, no newlines)

### "GOOGLE_DRIVE_FOLDER_ID not set"
- Add `GOOGLE_DRIVE_FOLDER_ID=1BKIM0XbS7pmaj54A1T2_dVh9QYID8l_W` to `.env`

### "Permission denied" when uploading
- Make sure the service account email has Editor access to the folder
- Re-share the folder with the email

### Photos not appearing in gallery
- Check that the backend returned a valid `downloadUrl`
- Verify the URL works in browser: `https://drive.google.com/uc?export=download&id=FILE_ID`

---

## 📝 Files Modified

- ✅ `galleryService.js` - Added Google Drive upload
- ✅ `server.js` - Added `/api/upload-photo` endpoint
- ✅ `package.json` - Already had googleapis
- ✅ `PhotoGallery.tsx` - Uses backend endpoint
- ✅ `.env.local` (wedding-app) - Removed Cloudinary
- ✅ `.env` (wedding-gallery-backend) - Added Google Drive config

---

## 🎉 Done!

Your wedding photos are now:
- ✅ Uploaded to your Google Drive
- ✅ Processed for AI tags and face detection
- ✅ Available in Photo Gallery
- ✅ Matched via Magic Gallery backend

Enjoy! 📸
