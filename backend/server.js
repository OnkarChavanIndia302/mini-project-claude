
const express = require("express");
const cors = require("cors");
const {
  S3Client,
  PutObjectCommand
} = require("@aws-sdk/client-s3");
const {
  getSignedUrl
} = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = 3000;

// CloudBox S3 configuration
const BUCKET_NAME = "omkarchavan321122";
const AWS_REGION = "us-east-1";

app.use(cors());
app.use(express.json());

// AWS SDK uses your locally configured AWS credentials/profile.
// Never hardcode AWS secret keys in this file.
const s3 = new S3Client({
  region: AWS_REGION
});

// Health check: confirms that the backend is running.
app.get("/", (req, res) => {
  res.json({
    message: "CloudBox backend is running!"
  });
});

// Generate a temporary URL for uploading encrypted data.
app.post("/api/upload-url", async (req, res) => {
  try {
    const { fileName, contentType } = req.body;

    if (
      typeof fileName !== "string" ||
      fileName.length === 0 ||
      fileName.length > 200 ||
      fileName.includes("/") ||
      fileName.includes("\\") ||
      fileName.includes("..")
    ) {
      return res.status(400).json({
        error: "Invalid file name"
      });
    }

    // Store objects under a dedicated prefix.
    const key =
      "encrypted/" +
      Date.now() +
      "-" +
      fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType:
        typeof contentType === "string"
          ? contentType
          : "application/octet-stream"
    });

    const uploadUrl = await getSignedUrl(
      s3,
      command,
      { expiresIn: 300 }
    );

    res.json({
      uploadUrl,
      key,
      expiresInSeconds: 300
    });
  } catch (error) {
    console.error("Upload URL error:", error.name);

    res.status(500).json({
      error: "Could not create upload URL. Check AWS permissions and configuration."
    });
  }
});

app.listen(PORT, () => {
  console.log(`CloudBox backend running at http://localhost:${PORT}`);
});
