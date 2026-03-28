const express = require('express');
const cors = require('cors');
const path = require('path');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', adminRoutes);
app.use('/api/user', userRoutes);

// Static file routing for global uploaded documents
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Basic health check route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Welcome to Bonagiri Chits API' });
});

module.exports = app;
