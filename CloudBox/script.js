// =============================================================
// CloudBox - Modern Secure File Management
// Deployed Live Backend Configuration & Client Storage
// =============================================================

const BACKEND_URL = 'https://mini-project-claude.onrender.com';

// Global state variables for Web Crypto API & S3 payload
let aesKey = null;
let encryptedBlocks = [];
let fileMetadata = null;
let selectedFile = null;

// Helper function to write messages to the terminal console
function setStatus(message, type = 'info') {
    const statusBox = document.getElementById('status') || document.getElementById('authError');
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
// 1. SESSION GUARD & INITIALIZATION
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('cloudbox_token');
    const user = localStorage.getItem('cloudbox_user') || 'User';

    const path = window.location.pathname;
    const isAuthPage = path.endsWith('login.html') || path.endsWith('register.html');

    // Route Protection: If not logged in and on dashboard, redirect to login
    if (!token && !isAuthPage) {
        window.location.href = 'login.html';
        return;
    }

    // If already logged in and visiting login/register, send to dashboard
    if (token && isAuthPage) {
        window.location.href = 'index.html';
        return;
    }

    // Generate clean User Avatar Initials (e.g. "Onkar Chavan" -> "OC", "Onkar" -> "ON")
    const userGreeting = document.getElementById('userGreeting');
    if (userGreeting && user) {
        const parts = user.trim().split(' ');
        let initials = parts[0].charAt(0).toUpperCase();
        if (parts.length > 1) {
            initials += parts[parts.length - 1].charAt(0).toUpperCase();
        } else if (parts[0].length > 1) {
            initials += parts[0].charAt(1).toUpperCase();
        }
        
        userGreeting.textContent = initials;
        userGreeting.title = `Logged in as ${user}`;
    }

    // Logout Click Listener
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('cloudbox_token');
            localStorage.removeItem('cloudbox_user');
            window.location.href = 'login.html';
        });
    }

    // Initialize drag-and-drop & file selection listeners
    initFileUploadHandlers();
});

// -------------------------------------------------------------
// 2. AUTHENTICATION HANDLERS (Login & Register)
// -------------------------------------------------------------

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const emailInput = document.getElementById('loginEmail') || document.getElementById('email');
        const passwordInput = document.getElementById('loginPassword') || document.getElementById('password');

        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

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
                localStorage.setItem('cloudbox_token', data.token || 'cloudbox_session_active');
                localStorage.setItem('cloudbox_user', data.username || email.split('@')[0]);
                
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 800);
            } else {
                setStatus(`Login Failed: ${data.error || 'Invalid email or password.'}`, 'error');
            }
        } catch (err) {
            setStatus(`Connection Error: ${err.message}`, 'error');
        }
    });
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUsername').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;

        setStatus('Registering user account...', 'info');

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
            }
        } catch (err) {
            setStatus(`Connection Error: ${err.message}`, 'error');
        }
    });
}

// -------------------------------------------------------------
// 3. FILE SELECTION & DRAG AND DROP HANDLERS
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
        dropZone.style.background = 'rgba(38,217,232,.06)';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'rgba(95,147,255,.45)';
        dropZone.style.background = 'rgba(67,133,255,.045)';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(95,147,255,.45)';
        dropZone.style.background = 'rgba(67,133,255,.045)';
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
    
    setStatus(`[FILE LOADED] ${file.name} (${(file.size / 1024).toFixed(2)} KB). Click "Encrypt (AES-256)" to begin.`, 'success');
}

// -------------------------------------------------------------
// 4. CLIENT-SIDE AES-256-GCM ENCRYPTION
// -------------------------------------------------------------

const encryptBtn = document.getElementById('encryptBtn');
if (encryptBtn) {
    encryptBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            setStatus('Error: Select a file first.', 'error');
            return;
        }

        const uploadBtn = document.getElementById('uploadBtn');
        const decryptBtn = document.getElementById('decryptBtn');

        setStatus('[ENCRYPTING] Processing file using Web Crypto API (AES-256-GCM)...', 'info');
        encryptBtn.disabled = true;

        try {
            // Generate Web Crypto AES 256-bit key
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

            setStatus('[ENCRYPTION COMPLETE] Encrypted payload ready for cloud upload.', 'success');
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
// 5. AWS S3 PRESIGNED UPLOAD PIPELINE
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
                throw new Error(data.error || 'Failed to get presigned upload URL.');
            }

            const payload = { metadata: fileMetadata, blocks: encryptedBlocks };

            setStatus('[UPLOADING] Transmitting payload to AWS S3 bucket...', 'info');
            const s3Response = await fetch(data.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (s3Response.ok) {
                setStatus(`[SUCCESS] Stored safely in AWS S3! Object Key: ${data.key}`, 'success');
            } else {
                throw new Error('S3 PUT upload request failed.');
            }
        } catch (err) {
            setStatus(`[UPLOAD ERROR] ${err.message}`, 'error');
        } finally {
            uploadBtn.disabled = false;
        }
    });
}

// -------------------------------------------------------------
// 6. CLIENT DECRYPTION & LOCAL FILE RESTORE
// -------------------------------------------------------------

const decryptBtn = document.getElementById('decryptBtn');
if (decryptBtn) {
    decryptBtn.addEventListener('click', async () => {
        if (!aesKey || !encryptedBlocks.length) {
            setStatus('Error: Missing cryptographic key or payload blocks.', 'error');
            return;
        }

        decryptBtn.disabled = true;
        setStatus('[DECRYPTING] Reconstructing file chunks & checking cryptographic signatures...', 'info');

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

            setStatus(`[DECRYPTION SUCCESS] Restored file: restored_${fileMetadata.name}`, 'success');
        } catch (err) {
            setStatus(`[DECRYPTION ERROR] ${err.message}`, 'error');
        } finally {
            decryptBtn.disabled = false;
        }
    });
}
