import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { registerUserFace, processCloudinaryImage, findMyPhotos, initModels } from './galleryService.js';

const app = express();
app.use(cors());
app.use(express.json());

// Handle image uploads in memory (for the user selfie)
const upload = multer({ storage: multer.memoryStorage() });

// 1. Endpoint: User registers their selfie
app.post('/api/register', upload.single('selfie'), async (req, res) => {
  try {
    const { userId } = req.body;
    const result = await registerUserFace(userId, req.file.buffer);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Endpoint: Find photos for a user
app.get('/api/photos/:userId', async (req, res) => {
  try {
    const photos = await findMyPhotos(req.params.userId);
    res.json({ photos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Endpoint: Process Cloudinary image (Tag + Face detection)
app.post('/api/process-image', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }
    const result = await processCloudinaryImage(imageUrl);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Image processing failed' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Backend running' });
});

const PORT = process.env.PORT || 10000;

// Initialize AI models before starting the server
initModels()
  .then(() => {
    app.listen(PORT, () => console.log(`🎬 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to load AI models', err);
    process.exit(1);
  });
