const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 1. Enable CORS for AWS Amplify & Local Frontend (Fixes "Failed to fetch" issue)
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 2. Connect to MongoDB Atlas via Environment Variable
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('CRITICAL ERROR: MONGO_URI is not defined in environment variables!');
} else {
    mongoose.connect(MONGO_URI)
      .then(() => console.log('MongoDB Atlas Connected Successfully! 🍃🚀'))
      .catch(err => console.error('MongoDB Atlas Connection Error:', err.message));
}

// ---------------------------------------------------------
// Basic Health Check Route
// ---------------------------------------------------------
app.get('/', (req, res) => {
    res.send('CloudBox Backend API is Live and Running!');
});

// ---------------------------------------------------------
// Import Routes (Jar tujhe auth kiwa file upload routes asatil)
// ---------------------------------------------------------
// Example:
// const authRoutes = require('./routes/auth');
// app.use('/api/auth', authRoutes);

// ---------------------------------------------------------
// Server Port Setup
// ---------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`CloudBox backend running on port ${PORT}`);
});
