const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 🟢 CORS Configuration (Fixes "Failed to fetch" on AWS Amplify)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Atlas Connected Successfully! 🍃🚀'))
  .catch(err => console.error('MongoDB Atlas Connection Error:', err.message));

// Basic Health Check Route
app.get('/', (req, res) => {
    res.json({ message: 'CloudBox Backend API is Live!' });
});

// Authentication Routes
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'All fields required' });
    }
    return res.status(200).json({ success: true, message: 'User registered successfully!' });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email & Password required' });
    }
    return res.status(200).json({ success: true, token: 'dummy_token', username: 'onkar' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`CloudBox backend running on port ${PORT}`);
});
