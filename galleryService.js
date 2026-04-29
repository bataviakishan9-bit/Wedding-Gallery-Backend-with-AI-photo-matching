import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import pg from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

// Monkey patch face-api for Node.js
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Railway Postgres
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
