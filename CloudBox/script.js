// =============================================================
// CloudBox - Modern Secure File Management
// Hosted Backend Configuration
// =============================================================

// 1. HOSTED BACKEND URL
const BACKEND_URL = 'https://mini-project-claude.onrender.com';

// State variables for Web Crypto API & S3 payload
let aesKey = null;
let encryptedBlocks = [];
let fileMetadata = null;

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const selectFileBtn = document.getElementById('selectFileBtn');
const selectedFileInfo = document.getElementById('selectedFileInfo');
const encryptBtn = document.getElementById('encryptBtn');
const uploadBtn = document.getElementById('uploadBtn');
const decryptBtn = document.getElementById('decryptBtn');
const statusBox = document.getElementById('statusBox');

// Helper function for status messages
function setStatus(message, type = 'info') {
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.className = `status-box ${type}`;
}

// -------------------------------------------------------------
// 2. AUTHENTICATION HANDLERS (Login & Register)
// -------------------------------------------------------------

// Handle User Login
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        setStatus('Logging in...', 'info');

        try {
            const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setStatus('Login successful! Redirecting...', 'success');
                localStorage.setItem('cloudbox_token', data.token);
                localStorage.setItem('cloudbox_user', data.username);
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
            } else {
                setStatus(`Login Failed: ${data.error || 'Invalid credentials'}`, 'error');
            }
        } catch (err) {
            setStatus(`Server Connection Error: ${err.message}`, 'error');
        }
    });
}

// Handle User Registration
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUsername').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;

        setStatus('Creating account...', 'info');

        try {
            const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setStatus('Registration successful! Redirecting to login...', 'success');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            } else {
                setStatus(`Registration Failed: ${data.error || 'Failed to register'}`, 'error');
            }
        } catch (err) {
            setStatus(`Server Connection Error: ${err.message}`, 'error');
        }
    });
}

// -------------------------------------------------------------
// 3. FILE SELECTION & ENCRYPTION PIPELINE
// -------------------------------------------------------------

let selectedFile = null;

if (selectFileBtn && fileInput) {
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0]));
}

if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            handleFileSelection(e.dataTransfer.files[0]);
        }
    });
}

function handleFileSelection(file) {
    if (!file) return;
    selectedFile = file;
    if (selectedFileInfo) {
        selectedFileInfo.textContent = `Selected File: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
    }
    if (encryptBtn) encryptBtn.disabled = false;
    setStatus('File loaded. Click "Encrypt File" to begin encryption.', 'info');
}

// AES-GCM Client-Side Encryption
if (encryptBtn) {
    encryptBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            setStatus('Please select a file first.', 'error');
            return;
        }

        setStatus('Encrypting file using Web Crypto API (AES-GCM-256)...', 'info');
        encryptBtn.disabled = true;

        try {
            // Generate 256-bit AES-GCM Key
            aesKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );

            const fileBuffer = await selectedFile.arrayBuffer();
            const chunkSize = 1024 * 1024; // 1MB chunks
            encryptedBlocks = [];

            for (let offset = 0; offset < fileBuffer.byteLength; offset += chunkSize) {
                const chunk = fileBuffer.slice(offset, offset + chunkSize);
                const iv = crypto.getRandomValues(new Uint8Array(12));

                const encryptedChunk = await crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv },
                    aesKey,
                    chunk
                );

                encryptedBlocks.push({
                    iv: Array.from(iv),
                    data: Array.from(new Uint8Array(encryptedChunk))
                });
            }

            fileMetadata = {
                name: selectedFile.name,
                size: selectedFile.size,
                type: selectedFile.type,
                totalBlocks: encryptedBlocks.length,
                timestamp: new Date().toISOString()
            };

            setStatus('File encrypted successfully! Ready to upload to AWS S3.', 'success');
            if (uploadBtn) uploadBtn.disabled = false;
            if (decryptBtn) decryptBtn.disabled = false;

        } catch (err) {
            setStatus(`Encryption Error: ${err.message}`, 'error');
        } finally {
            encryptBtn.disabled = false;
        }
    });
}

// -------------------------------------------------------------
// 4. AWS S3 PRESIGNED UPLOAD PIPELINE
// -------------------------------------------------------------

if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
        if (!encryptedBlocks.length || !fileMetadata) {
            setStatus('No encrypted payload available. Encrypt a file first.', 'error');
            return;
        }

        uploadBtn.disabled = true;
        setStatus('Requesting AWS S3 Presigned Upload URL...', 'info');

        try {
            const response = await fetch(`${BACKEND_URL}/api/upload-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: fileMetadata.name,
                    contentType: 'application/json'
                })
            });

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Backend server error. Check Render logs.");
            }

            const data = await response.json();
            if (!response.ok || !data.uploadUrl) {
                throw new Error(data.error || 'Failed to get upload URL');
            }

            const payload = { metadata: fileMetadata, blocks: encryptedBlocks };

            setStatus('Uploading encrypted file payload to AWS S3...', 'info');
            const s3Response = await fetch(data.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (s3Response.ok) {
                setStatus(`Uploaded to AWS S3! Key: ${data.key}`, 'success');
            } else {
                throw new Error('Direct S3 upload failed');
            }
        } catch (err) {
            setStatus(`Upload Error: ${err.message}`, 'error');
        } finally {
            uploadBtn.disabled = false;
        }
    });
}

// -------------------------------------------------------------
// 5. DECRYPTION PIPELINE
// -------------------------------------------------------------

if (decryptBtn) {
    decryptBtn.addEventListener('click', async () => {
        if (!aesKey || !encryptedBlocks.length) {
            setStatus('No encryption key or encrypted blocks found.', 'error');
            return;
        }

        decryptBtn.disabled = true;
        setStatus('Decrypting blocks and restoring original file...', 'info');

        try {
            const decryptedParts = [];

            for (const block of encryptedBlocks) {
                const decryptedBuffer = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: new Uint8Array(block.iv) },
                    aesKey,
                    new Uint8Array(block.data)
                );
                decryptedParts.push(decryptedBuffer);
            }

            const restoredBlob = new Blob(decryptedParts, {
                type: fileMetadata.type || 'application/octet-stream'
            });

            const url = URL.createObjectURL(restoredBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `restored_${fileMetadata.name}`;
            document.body.appendChild(link);
            link.click();
            link.remove();

            setStatus(`Success! Restored file downloaded: restored_${fileMetadata.name}`, 'success');
        } catch (err) {
            setStatus(`Decryption Error: ${err.message}`, 'error');
        } finally {
            decryptBtn.disabled = false;
        }
    });
}
