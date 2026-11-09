require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'cloudbox_jwt_secret_key_2026';

// -------------------------------------------------------------
// 1. MONGODB ATLAS CONNECTION & SCHEMAS
// -------------------------------------------------------------
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cloudbox')
    .then(() => console.log('MongoDB Atlas Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Stored File Schema (Includes storageType for Multi-Cloud)
const fileSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    fileName: { type: String, required: true },
    s3Key: { type: String, required: true },
    storageType: { type: String, enum: ['AWS_S3_NORMAL', 'CLOUDFLARE_SECURE'], default: 'AWS_S3_NORMAL' },
    uploadedAt: { type: Date, default: Date.now }
});
const FileModel = mongoose.model('File', fileSchema);

// -------------------------------------------------------------
// 2. AWS S3 CLIENT INITIALIZATION
// -------------------------------------------------------------
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// -------------------------------------------------------------
// 3. AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email already registered.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ email, password: hashedPassword });
        res.json({ success: true, message: 'User registered successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, error: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Invalid credentials.' });
        }

        const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, email: user.email });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// -------------------------------------------------------------
// 4. STORAGE & FILE METADATA ENDPOINTS
// -------------------------------------------------------------

// Presigned URL for AWS S3 Upload (Standard Mode)
app.post('/api/upload-url', async (req, res) => {
    try {
        const { fileName, contentType } = req.body;
        const key = `uploads/${Date.now()}_${fileName}`;

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            ContentType: contentType || 'application/octet-stream'
        });

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
        res.json({ success: true, uploadUrl, key });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Record File Metadata in MongoDB Atlas
app.post('/api/record-file', async (req, res) => {
    try {
        const { email, fileName, s3Key, storageType } = req.body;
        const newFile = await FileModel.create({
            userId: email,
            fileName,
            s3Key,
            storageType: storageType || 'AWS_S3_NORMAL'
        });
        res.json({ success: true, file: newFile });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get User Stored Files List
app.get('/api/user-files', async (req, res) => {
    try {
        const email = req.query.email;
        const files = await FileModel.find({ userId: email }).sort({ uploadedAt: -1 });
        res.json({ success: true, files });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Server Root Check
app.get('/', (req, res) => {
    res.send('CloudBox Multi-Cloud Storage API Engine is Active');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
