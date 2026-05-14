const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Ensure upload directories exist
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const uploadDirs = [
  './uploads/profiles',
  './uploads/products',
  './uploads/companies',
  './uploads/nids',
  './uploads/ai',
  './uploads/deliveries'
];

uploadDirs.forEach(ensureDir);

// Storage configuration
const createStorage = (folder) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = `./uploads/${folder}`;
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const filename = `${uuidv4()}${ext}`;
      cb(null, filename);
    }
  });
};

// File filter
const imageFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed'), false);
  }
};

// Upload configurations
const uploadProfile = multer({
  storage: createStorage('profiles'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const uploadProduct = multer({
  storage: createStorage('products'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const uploadCompany = multer({
  storage: createStorage('companies'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadNID = multer({
  storage: createStorage('nids'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadAI = multer({
  storage: createStorage('ai'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadDeliveryProof = multer({
  storage: createStorage('deliveries'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

module.exports = { uploadProfile, uploadProduct, uploadCompany, uploadNID, uploadAI, uploadDeliveryProof };