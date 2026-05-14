const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('../middleware/upload');

const companyUpload = multer({
    storage: new CloudinaryStorage({
        cloudinary,
        params: (req, file) => {
            let folder = 'flexcart/companies';
            if (file.fieldname === 'nid_front_image' || file.fieldname === 'nid_back_image') {
                folder = 'flexcart/nids';
            } else if (file.fieldname === 'face_image') {
                folder = 'flexcart/faces';
            }
            return { folder, allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'], resource_type: 'image' };
        },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
});

const productUpload = multer({
    storage: new CloudinaryStorage({
        cloudinary,
        params: (req, file) => {
            const folder = file.fieldname === 'ar_qr_image' ? 'flexcart/products/ar' : 'flexcart/products';
            return { folder, allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'], resource_type: 'image' };
        },
    }),
    limits: { fileSize: 100 * 1024 * 1024 },
});
// Company CRUD
router.post('/',
    authenticateToken,
    companyUpload.fields([
        { name: 'nid_front_image', maxCount: 1 },
        { name: 'nid_back_image',  maxCount: 1 },
        { name: 'face_image',      maxCount: 1 },
        { name: 'company_logo',    maxCount: 1 }
    ]),
    companyController.createCompany
);

router.put('/',
    authenticateToken,
    companyUpload.fields([
        { name: 'company_logo', maxCount: 1 },
        { name: 'cover_image', maxCount: 1 },
        { name: 'promo_banner', maxCount: 1 }
    ]),
    companyController.updateCompany
);

router.delete('/promo-banner', authenticateToken, companyController.deletePromoBanner);

router.delete('/:id', authenticateToken, companyController.deleteCompany);

// My companies
router.get('/my-companies', authenticateToken, companyController.getMyCompanies);
router.get('/my-company', authenticateToken, companyController.getMyCompany);

// Dashboard
router.get('/dashboard/:id', authenticateToken, companyController.getCompanyDashboard);
router.get('/:id/orders/:orderNumber/branch-options', authenticateToken, companyController.listAssignableBranchesForOrder);
router.post('/:id/orders/:orderNumber/assign-branch', authenticateToken, companyController.assignOrderToBranch);
router.post('/:id/orders/:orderNumber/assign-nearest-branch', authenticateToken, companyController.assignOrderToBranch);

// Product management
router.post('/products',
    authenticateToken,
    productUpload.fields([
        { name: 'images', maxCount: 10 },
        { name: 'ar_qr_image', maxCount: 1 }
    ]),
    companyController.addProduct
);

router.put('/products/:productId',
    authenticateToken,
    productUpload.fields([
        { name: 'images', maxCount: 10 },
        { name: 'ar_qr_image', maxCount: 1 }
    ]),
    companyController.updateProduct
);

router.delete('/products/:productId',
    authenticateToken,
    companyController.deleteProduct
);
// Product images
router.get('/products/:productId/images', authenticateToken, companyController.getProductImages);
// Notifications
router.get('/:id/notifications', authenticateToken, companyController.getCompanyNotifications);
router.put('/:companyId/notifications/:notificationId/read', authenticateToken, companyController.markCompanyNotificationRead);

// Follow
router.get('/following', authenticateToken, companyController.getFollowingCompanies);
router.post('/follow', authenticateToken, companyController.toggleFollow);
router.put('/follow/:companyId/notifications', authenticateToken, companyController.toggleCompanyNotifications);

// Rate
router.post('/rate', authenticateToken, companyController.rateCompany);

// Leaderboard
router.get('/leaderboard', authenticateToken, companyController.getLeaderboard);

// Public company search (for feedback/complaint form)
router.get('/search', companyController.searchCompanies);

// Public
router.get('/:id', optionalAuth, companyController.getCompanyById);
router.get('/:companyId/products/:categoryId', optionalAuth, companyController.getCompanyProductsByCategory);

module.exports = router;