const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const createStorage = (folder) => new CloudinaryStorage({
  cloudinary,
  params: {
    folder: `flexcart/${folder}`,
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    resource_type: 'image',
  },
});

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
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadProduct = multer({
  storage: createStorage('products'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadCompany = multer({
  storage: createStorage('companies'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadNID = multer({
  storage: createStorage('nids'),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadAI = multer({
  storage: createStorage('ai'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadDeliveryProof = multer({
  storage: createStorage('deliveries'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = { uploadProfile, uploadProduct, uploadCompany, uploadNID, uploadAI, uploadDeliveryProof, cloudinary };