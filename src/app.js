const express = require('express');
const cors = require('cors');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/admin', adminRoutes);

// Basic health check route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Welcome to Bonagiri Chits API' });
});

module.exports = app;
