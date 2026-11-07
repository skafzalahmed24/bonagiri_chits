const express = require('express');
const cors = require('cors');
const path = require('path');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const { startDailyPenaltyCron } = require('./utils/cronJobs');
const { errorResponse } = require('./utils/responseHelper');
const statusCodes = require('./utils/statusCodes');

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
// Normalize consecutive slashes in request URLs (e.g. /api//uploads/ -> /api/uploads/)
// Ensures mobile apps concatenating baseUrl + '/uploads/...' load assets cleanly without 404
app.use((req, res, next) => {
  if (req.url && req.url.includes('//')) {
    const [pathname, search] = req.url.split('?');
    req.url = pathname.replace(/\/{2,}/g, '/') + (search !== undefined ? '?' + search : '');
  }
  next();
});

app.use('/api', auditLogger); // Applies globally to all /api and /api/user routes exactly once
app.use('/api', adminRoutes);
app.use('/api/user', userRoutes);

// Static file routing for global uploaded documents & public assets
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/public', express.static(path.join(__dirname, 'utils/public')));
app.use('/api/public', express.static(path.join(__dirname, 'utils/public')));

// Basic health check route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Welcome to Bonagiri Chits API' });
});

// Malformed JSON body: the body parser already answers 400; this only changes the BODY of that answer.
// Without it Express' default handler returns an HTML page with the stack trace and file paths
// (unless NODE_ENV=production). Every other error (413 too large, 415, route errors...) is passed on
// untouched, so its status code and body stay exactly as before.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed' && !res.headersSent) {
    return errorResponse(res, statusCodes.BAD_REQUEST, 'Invalid JSON body');
  }
  return next(err);
});

module.exports = app;
