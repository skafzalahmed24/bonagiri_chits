const express = require('express');
const cors = require('cors');
const path = require('path');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const { startDailyPenaltyCron } = require('./utils/cronJobs');

const app = express();

// Start Background Jobs immediately automatically
startDailyPenaltyCron();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global middleware to convert empty strings to null
app.use((req, res, next) => {
  const sanitizeEmptyStrings = (obj) => {
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (obj[key] === '') {
          obj[key] = null;
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeEmptyStrings(obj[key]);
        }
      }
    }
  };

  if (req.body) {
    sanitizeEmptyStrings(req.body);
  }
  
  next();
});

// Routes
const auditLogger = require('./middlewares/auditMiddleware');
app.use('/api', auditLogger); // Applies globally to all /api and /api/user routes exactly once
app.use('/api', adminRoutes);
app.use('/api/user', userRoutes);

// Static file routing for global uploaded documents
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

// Basic health check route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Welcome to Bonagiri Chits API' });
});

module.exports = app;
