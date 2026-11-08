// =============================================================
// CloudBox - Modern Secure File Management
// Deployed Live Backend Configuration & Client Storage
// =============================================================

const BACKEND_URL = 'https://mini-project-claude.onrender.com';

// Global variables for Web Crypto API & S3 payload
let aesKey = null;
let encryptedBlocks = [];
let fileMetadata = null;
let selectedFile = null;

// Helper function for status messages in terminal UI
function setStatus(message, type = 'info') {
    const statusBox = document.getElementById('status');
    if (!statusBox) return;
    statusBox.textContent = message;
    
    if (type === 'error') {
        statusBox.style.color = '#ff5f57';
    } else if (type === 'success') {
        statusBox.style.color = '#25d69a';
    } else {
        statusBox.style.color = '#45d6ae';
    }
}

// -------------------------------------------------------------
// 1. SESSION GUARD & INITIALIZATION (CLEANED)
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('cloudbox_token');
    const user = localStorage.getItem('cloudbox_user');

    const path = window.location.pathname;
    const isAuthPage = path.includes('login.html') || path.includes('register.html');

    // Route Protection: If not logged in and not on login/register pages, redirect to login
    if (!token && !isAuthPage) {
        window.location.href = 'login.html';
        return;
    }

    // If already logged in and visiting login/register pages, send to dashboard
    if (token && isAuthPage) {
        window.location.href = 'index.html';
        return;
    }

    // Update Avatar Initials if on Dashboard
    const userGreeting = document.getElementById('userGreeting');
    if (userGreeting && user) {
        userGreeting.textContent = user.substring(0, 2).toUpperCase();
        userGreeting.title = `Logged in as ${user}`;
    }

    // Attach Logout Click Listener
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('cloudbox_token');
            localStorage.removeItem('cloudbox_user');
            window.location.href = 'login.html';
        });
    }

    // Bind File Input and Drag/Drop events
    initFileUploadHandlers();
});

// -------------------------------------------------------------
// 2. AUTHENTICATION HANDLERS (Login & Register)
// -------------------------------------------------------------

// Login Form Submit Handler
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        setStatus('Authenticating credentials...', 'info');

        try {
            const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setStatus('Login successful! Redirecting to dashboard...', 'success');
                localStorage.setItem('cloudbox_token', data.token || 'cloudbox_session');
                localStorage.setItem('cloudbox_user', data.username || email.split('@')[0]);
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 800);
            } else {
                setStatus(`Login Failed: ${data.error || 'Invalid credentials.'}`, 'error');
                alert(data.error || 'Login Failed. User may not be registered.');
            }
        } catch (err) {
            setStatus(`Connection Error: ${err.message}`, 'error');
        }
    });
}

// Registration Form Submit Handler
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUsername').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;

        setStatus('Registering account with server...', 'info');

        try {
            const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setStatus('Registration successful! Redirecting to login...', 'success');
                alert('Account registered successfully! Please log in.');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1000);
            } else {
                setStatus(`Registration Failed: ${data.error || 'Could not register user.'}`, 'error');
                alert(data.error || 'Registration failed.');
            }
        } catch (err) {
            setStatus(`Connection Error: ${err.message}`, 'error');
        }
    });
}

// -------------------------------------------------------------
// 3. FILE SELECTION & ENCRYPTION PIPELINE
// -------------------------------------------------------------

function initFileUploadHandlers() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    if (!dropZone || !fileInput) return;

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#26d9e8';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'rgba(95,147,255,.45)';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(95,147,255,.45)';
        if (e.dataTransfer.files.length) {
            handleFileSelection(e.dataTransfer.files[0]);
        }
    });
}

function handleFileSelection(file) {
    if (!file) return;
    selectedFile = file;
    const encryptBtn = document.getElementById('encryptBtn');
    if (encryptBtn) encryptBtn.disabled = false;
    
    setStatus(`[FILE SELECTED] ${file.name} (${(file.size / 1024).toFixed(2)} KB). Click "Encrypt (AES-256)" to proceed.`, 'info');
}

// Encryption Process Handler
const encryptBtn = document.getElementById('encryptBtn');
if (encryptBtn) {
    encryptBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            setStatus('Error: Please select a file first.', 'error');
            return;
        }

        const uploadBtn = document.getElementById('uploadBtn');
        const decryptBtn = document.getElementById('decryptBtn');

        setStatus('[ENCRYPTING] Processing file with Web Crypto API (AES-256-GCM)...', 'info');
        encryptBtn.disabled = true;

        try {
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

            setStatus('[ENCRYPTION COMPLETE] Payload ready for cloud upload.', 'success');
            if (uploadBtn) uploadBtn.disabled = false;
            if (decryptBtn) decryptBtn.disabled = false;

        } catch (err) {
            setStatus(`[ENCRYPTION ERROR] ${err.message}`, 'error');
        } finally {
            encryptBtn.disabled = false;
        }
    });
}

// -------------------------------------------------------------
// 4. AWS S3 PRESIGNED URL UPLOAD
// -------------------------------------------------------------

const uploadBtn = document.getElementById('uploadBtn');
if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
        if (!encryptedBlocks.length || !fileMetadata) {
            setStatus('Error: No encrypted payload ready to upload.', 'error');
            return;
        }

        uploadBtn.disabled = true;
        setStatus('[CONNECTING] Requesting presigned URL from Render backend...', 'info');

        try {
            const response = await fetch(`${BACKEND_URL}/api/upload-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: fileMetadata.name,
                    contentType: 'application/json'
                })
            });

            const data = await response.json();
            if (!response.ok || !data.uploadUrl) {
                throw new Error(data.error || 'Failed to acquire presigned upload URL');
            }

            const payload = { metadata: fileMetadata, blocks: encryptedBlocks };

            setStatus('[UPLOADING] Encrypted binary payload transmitting to AWS S3...', 'info');
            const s3Response = await fetch(data.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (s3Response.ok) {
                setStatus(`[SUCCESS] File payload stored safely in AWS S3 bucket! Key: ${data.key}`, 'success');
            } else {
                throw new Error('S3 direct PUT upload failed.');
            }
        } catch (err) {
            setStatus(`[UPLOAD ERROR] ${err.message}`, 'error');
        } finally {
            uploadBtn.disabled = false;
        }
    });
}

// -------------------------------------------------------------
// 5. DECRYPTION & DOWNLOAD PIPELINE
// -------------------------------------------------------------

const decryptBtn = document.getElementById('decryptBtn');
if (decryptBtn) {
    decryptBtn.addEventListener('click', async () => {
        if (!aesKey || !encryptedBlocks.length) {
            setStatus('Error: Missing AES key or block data.', 'error');
            return;
        }

        decryptBtn.disabled = true;
        setStatus('[DECRYPTING] Reconstructing file chunks and verifying cryptographic signature...', 'info');

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

            setStatus(`[DECRYPTION SUCCESS] Restored file generated: restored_${fileMetadata.name}`, 'success');
        } catch (err) {
            setStatus(`[DECRYPTION ERROR] ${err.message}`, 'error');
        } finally {
            decryptBtn.disabled = false;
        }
    });
}
