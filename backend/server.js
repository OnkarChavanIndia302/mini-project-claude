require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors({ origin: '*' }));

// 🍃 MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Atlas Connected Successfully! 🍃🚀'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// 🔐 AWS S3 Client Setup
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// User Auth Schema & Routes (Login / Register)
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, error: 'User already exists' });
    
    const user = new User({ username, email, password });
    await user.save();
    res.json({ success: true, message: 'User created' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Verify input fields exist
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Please provide both email and password.' 
            });
        }

        // 2. Check if the user exists in MongoDB first
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not registered. Please register first.' 
            });
        }

        // 3. Verify the password matches
        if (user.password !== password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Incorrect password.' 
            });
        }

        // 4. Successful login
        res.json({ 
            success: true, 
            message: 'Login successful', 
            username: user.username, 
            token: 'cloudbox_demo_token' 
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ☁️ AWS S3 Upload Presigned URL Generator Endpoint
app.post('/api/upload-url', async (req, res) => {
  try {
    const { fileName, contentType } = req.body;
    const key = `encrypted/${Date.now()}_${fileName}.json`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'application/json'
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    res.json({ success: true, uploadUrl, key });
  } catch (err) {
    console.error("S3 Upload Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const fileSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    fileName: { type: String, required: true },
    fileKey: { type: String, required: true },
    storageType: { type: String, enum: ['AWS_S3_NORMAL', 'CLOUDFLARE_SECURE'], required: true },
    uploadedAt: { type: Date, default: Date.now }
});

const FileModel = mongoose.model('File', fileSchema);

// Endpoint to fetch all past uploaded files for a logged-in user
app.get('/api/user-files', async (req, res) => {
    try {
        const email = req.query.email;
        const files = await FileModel.find({ userId: email }).sort({ uploadedAt: -1 });
        res.json({ success: true, files });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint to record a new file upload
app.post('/api/record-file', async (req, res) => {
    try {
        const { email, fileName, s3Key } = req.body;
        const newFile = await FileModel.create({ userId: email, fileName, s3Key });
        res.json({ success: true, file: newFile });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


app.get('/', (req, res) => {
  res.send('CloudBox Backend Active 🚀');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`CloudBox backend running on port ${PORT}`);
});
