import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import pg from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';
import fs from 'fs';
import 'dotenv/config';

// Monkey patch face-api for Node.js
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Railway Postgres
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let driveClient = null;

async function initGoogleDrive() {
  try {
    const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
    if (!serviceAccountKey.type) {
      console.warn('⚠️  Google Drive API key not configured. Upload endpoint will be disabled.');
      return null;
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    driveClient = google.drive({ version: 'v3', auth });
    console.log('✅ Google Drive API initialized');
    return driveClient;
  } catch (error) {
    console.error('⚠️  Google Drive init error:', error.message);
    return null;
  }
}

export async function uploadToGoogleDrive(fileBuffer, fileName) {
  if (!driveClient) throw new Error('Google Drive API not configured');

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set');

  try {
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType: 'image/jpeg',
      body: fileBuffer,
    };

    const response = await driveClient.files.create({
      resource: fileMetadata,
      media,
      fields: 'id, webViewLink',
    });

    const fileId = response.data.id;
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    return { fileId, downloadUrl, webLink: response.data.webViewLink };
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    throw error;
  }
}

// Load Models
export async function initModels() {
  try {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk('./models');
    await faceapi.nets.faceLandmark68Net.loadFromDisk('./models');
    await faceapi.nets.faceRecognitionNet.loadFromDisk('./models');

    // Ensure pgvector extension is active in Render DB
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');

    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (user_id VARCHAR(255) PRIMARY KEY, face_descriptor vector(128));
      CREATE TABLE IF NOT EXISTS event_photos (photo_id SERIAL PRIMARY KEY, cloudinary_url TEXT UNIQUE, ai_tags TEXT, uploaded_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS detected_faces (face_id SERIAL PRIMARY KEY, photo_id INT REFERENCES event_photos(photo_id), face_descriptor vector(128));
    `);

    await initGoogleDrive();

    console.log('✅ Models loaded and database ready');
  } catch (error) {
    console.error('❌ Error initializing:', error);
    throw error;
  }
}

export async function registerUserFace(userId, imageBuffer) {
  const img = await loadImage(imageBuffer);
  const detection = await faceapi
    .detectSingleFace(img)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) throw new Error('No face detected. Try a clearer selfie.');

  const descriptorArray = Array.from(detection.descriptor);
  await pool.query(
    `INSERT INTO users (user_id, face_descriptor) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET face_descriptor = $2`,
    [userId, `[${descriptorArray.join(',')}]`]
  );
  return { success: true };
}

export async function processCloudinaryImage(imageUrl) {
  try {
    // Skip if already processed
    const existing = await pool.query('SELECT 1 FROM event_photos WHERE cloudinary_url = $1', [imageUrl]);
    if (existing.rows.length > 0) return { success: false, message: 'Image already processed' };

    // Fetch image from Cloudinary URL
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // 1. Claude Tagging
    const base64Image = imageBuffer.toString('base64');
    const msg = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64Image },
            },
            {
              type: 'text',
              text: '5 comma-separated tags for this setting/clothing. No other text.',
            },
          ],
        },
      ],
    });
    const aiTags = msg.content[0].text;

    // 2. Save Photo Record
    const photoRes = await pool.query(
      'INSERT INTO event_photos (cloudinary_url, ai_tags) VALUES ($1, $2) RETURNING photo_id',
      [imageUrl, aiTags]
    );
    const photoId = photoRes.rows[0].photo_id;

    // 3. Face Detection
    const img = await loadImage(imageBuffer);
    const detections = await faceapi
      .detectAllFaces(img)
      .withFaceLandmarks()
      .withFaceDescriptors();

    for (const face of detections) {
      const faceArray = Array.from(face.descriptor);
      await pool.query('INSERT INTO detected_faces (photo_id, face_descriptor) VALUES ($1, $2)', [
        photoId,
        `[${faceArray.join(',')}]`,
      ]);
    }

    return { success: true, photoId, facesDetected: detections.length };
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

export async function findMyPhotos(userId) {
  const userRes = await pool.query('SELECT face_descriptor FROM users WHERE user_id = $1', [userId]);
  if (userRes.rows.length === 0) return [];

  const matchQuery = `
    SELECT DISTINCT e.cloudinary_url, e.ai_tags
    FROM detected_faces d
    JOIN event_photos e ON d.photo_id = e.photo_id
    WHERE d.face_descriptor <-> $1 < 0.45
  `;
  const matches = await pool.query(matchQuery, [userRes.rows[0].face_descriptor]);
  return matches.rows;
}

export async function scanAndIndexGoogleDrivePhotos() {
  if (!driveClient) throw new Error('Google Drive API not configured');

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set');

  try {
    const files = await driveClient.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/'`,
      spaces: 'drive',
      fields: 'files(id, name, webViewLink)',
      pageSize: 1000,
    });

    if (!files.data.files || files.data.files.length === 0) {
      return { success: true, processed: 0, message: 'No photos found' };
    }

    let processed = 0;
    for (const file of files.data.files) {
      try {
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;

        const existing = await pool.query(
          'SELECT 1 FROM event_photos WHERE cloudinary_url = $1',
          [downloadUrl]
        );
        if (existing.rows.length > 0) continue;

        const response = await fetch(downloadUrl);
        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);

        const base64Image = imageBuffer.toString('base64');
        const msg = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/jpeg', data: base64Image },
                },
                {
                  type: 'text',
                  text: '5 comma-separated tags. No other text.',
                },
              ],
            },
          ],
        });
        const aiTags = msg.content[0].text;

        const photoRes = await pool.query(
          'INSERT INTO event_photos (cloudinary_url, ai_tags) VALUES ($1, $2) RETURNING photo_id',
          [downloadUrl, aiTags]
        );
        const photoId = photoRes.rows[0].photo_id;

        const img = await loadImage(imageBuffer);
        const detections = await faceapi
          .detectAllFaces(img)
          .withFaceLandmarks()
          .withFaceDescriptors();

        for (const face of detections) {
          const faceArray = Array.from(face.descriptor);
          await pool.query(
            'INSERT INTO detected_faces (photo_id, face_descriptor) VALUES ($1, $2)',
            [photoId, `[${faceArray.join(',')}]`]
          );
        }

        processed++;
        console.log(`✅ Indexed: ${file.name}`);
      } catch (error) {
        console.warn(`⚠️ Error: ${file.name}`, error.message);
      }
    }

    return { success: true, processed, total: files.data.files.length };
  } catch (error) {
    console.error('Scan error:', error);
    throw error;
  }
}
