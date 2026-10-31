const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 3000;

// CloudBox S3 configuration
const BUCKET_NAME = "omkarchavan321122";
const AWS_REGION = "us-east-1";

app.use(cors());
app.use(express.json());

// 1. Connect to Local MongoDB Database
mongoose.connect('mongodb://127.0.0.1:27017/cloudbox_db', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB Connected Successfully to Local Database! 🍃');
}).catch(err => {
    console.error('MongoDB Connection Failed:', err.message);
});

// 2. User Schema & Model for Authentication
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// 3. User Registration Endpoint
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        let existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'User already exists with this email!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        res.json({ success: true, message: 'Registration successful!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. User Login Endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, error: 'Invalid email or password!' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Invalid email or password!' });
        }

        const token = jwt.sign({ userId: user._id, email: user.email }, 'MY_SUPER_SECRET_KEY', { expiresIn: '2h' });

        res.json({ 
            success: true, 
            message: 'Login successful!', 
            token, 
            username: user.username 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// AWS S3 Client setup
const s3 = new S3Client({ region: AWS_REGION });

// Health check: confirms that the backend is running.
app.get("/", (req, res) => {
    res.json({ message: "CloudBox backend is running with MongoDB & S3! 🚀" });
});

// Generate a temporary URL for uploading encrypted data.
app.post("/api/upload-url", async (req, res) => {
    try {
        const { fileName, contentType } = req.body;
        if (typeof fileName !== "string" || fileName.length === 0 || fileName.length > 200 || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
            return res.status(400).json({ error: "Invalid file name" });
        }

        // Store objects under a dedicated prefix.
        const key = "encrypted/" + Date.now() + "-" + fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: typeof contentType === "string" ? contentType : "application/octet-stream"
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
        res.json({ uploadUrl, key, expiresInSeconds: 300 });
    } catch (error) {
        console.error("Upload URL error:", error.name);
        res.status(500).json({ error: "Could not create upload URL. Check AWS permissions and configuration." });
    }
});

app.listen(PORT, () => {
    console.log(`CloudBox backend running at http://localhost:${PORT}`);
});
