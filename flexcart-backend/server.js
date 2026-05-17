const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const http = require('http');
require('dotenv').config();

const { testConnection } = require('./config/db');
const { initRealtimeGateway } = require('./services/realtimeGateway');
const { runStartupMigration } = require('./services/startup-migration');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const cartRoutes = require('./routes/cartRoutes');
const companyRoutes = require('./routes/companyRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const favouriteRoutes = require('./routes/favouriteRoutes');
const requestProductRoutes = require('./routes/requestProductRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const spinRewardRoutes = require('./routes/spinRewardRoutes');
const reviewGraphRoutes = require('./routes/reviewGraphRoutes');
const supportRoutes = require('./routes/supportRoutes');
const profileRoutes = require('./routes/profileRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const aiRoutes = require('./routes/aiRoutes');
const negotiationRoutes = require('./routes/negotiationRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const staffAdminRoutes = require('./routes/staffAdminRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: { action: 'sameorigin' },
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            'frame-ancestors': ["'self'"]
        }
    }
}));

// Gzip compression — reduces API response sizes significantly
app.use(compression());

// CORS
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.some(o => origin === o || origin.endsWith('.vercel.app'))) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate Limiting
// Strict limiter for auth routes only (prevents brute-force on login/register)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests, please try again later' },
    skip: () => process.env.NODE_ENV === 'test'
});

// General limiter — prevents abuse while allowing normal usage
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { success: false, message: 'Too many requests, please try again later' }
});
app.use('/api/', generalLimiter);

// Body Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/favourites', favouriteRoutes);
app.use('/api/product-requests', requestProductRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/spin-reward', spinRewardRoutes);
app.use('/api/review-graph', reviewGraphRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/negotiations', negotiationRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/staff-admin', staffAdminRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/payment', paymentRoutes);

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'FlexCart API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Root health check for Render
app.get('/', (req, res) => {
    res.json({ success: true, message: 'FlexCart API' });
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// Multer Error Handler (must be before global error handler)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum 25MB per file.'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Maximum 10 files allowed.'
            });
        }
        return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Global Error:', err);

    if (err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: 'File too large' });
    }

    if (err.message && err.message.includes('Only image files')) {
        return res.status(400).json({ success: false, message: err.message });
    }

    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});
// Start Server — listen immediately so health checks pass, then init DB
const startServer = async () => {
    initRealtimeGateway(server);
    server.listen(PORT, () => {
        console.log(`\n🚀 FlexCart Server running on http://localhost:${PORT}`);
        console.log(`📋 API Documentation: http://localhost:${PORT}/api/health`);
        console.log(`🔌 Realtime Gateway: enabled`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });
    // DB init runs after server is up (non-blocking for health check)
    testConnection().then(() => runStartupMigration()).catch(err => {
        console.error('❌ Startup DB init failed:', err.message);
    });
};

startServer();

module.exports = app;