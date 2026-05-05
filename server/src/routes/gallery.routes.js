import { Router } from 'express';
import multer from 'multer';
import {
  getFolders, createFolder, deleteFolder,
  getImages, uploadImage, deleteImage, previewImage,
  proxyImage, importImageFromUrl,
} from '../controllers/gallery.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB max (Meta limit)
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WEBP, MP4 files allowed'));
  },
});

// ── Public routes — no auth (used as <img src> in browser, can't send JWT) ───
const publicRouter = Router();
publicRouter.get('/proxy',             proxyImage);          // GET /api/gallery/proxy?url=...
publicRouter.get('/images/:id/preview', previewImage);       // GET /api/gallery/images/:id/preview

// ── Protected routes — JWT required ──────────────────────────────────────────
const router = Router();

// Folders
router.get('/folders',             getFolders);
router.post('/folders',            createFolder);
router.delete('/folders/:id',      deleteFolder);

// Images
router.get('/folders/:folderId/images',          getImages);
router.post('/folders/:folderId/upload', upload.single('file'), uploadImage);
router.delete('/images/:id',             deleteImage);

// Utilities
router.post('/import-url', importImageFromUrl);              // POST /api/gallery/import-url { image_url }

export { router as galleryRoutes, publicRouter as galleryPublicRoutes };
