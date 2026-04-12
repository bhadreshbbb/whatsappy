import { Router } from 'express';
import multer from 'multer';
import {
  getFolders, createFolder, deleteFolder,
  getImages, uploadImage, deleteImage, previewImage,
  proxyImage, importImageFromUrl,
} from '../controllers/gallery.controller.js';

const router  = Router();
const upload  = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB max (Meta limit)
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WEBP, MP4 files allowed'));
  },
});

// Folders
router.get('/folders',             getFolders);
router.post('/folders',            createFolder);
router.delete('/folders/:id',      deleteFolder);

// Images
router.get('/folders/:folderId/images',          getImages);
router.post('/folders/:folderId/upload', upload.single('file'), uploadImage);
router.delete('/images/:id',             deleteImage);
router.get('/images/:id/preview',        previewImage);

// Utilities
router.get('/proxy',               proxyImage);          // GET /api/gallery/proxy?url=<external-image-url>
router.post('/import-url',         importImageFromUrl);  // POST /api/gallery/import-url { image_url }

export { router as galleryRoutes };
