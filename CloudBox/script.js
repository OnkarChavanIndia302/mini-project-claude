// =============================================================
// CloudBox - Modern Multi-Cloud File Manager
// AWS S3 (Standard) & Cloudflare R2 (Encrypted Vault)
// =============================================================

const BACKEND_URL = 'https://mini-project-claude.onrender.com';

let selectedFile = null;

// Helper function to write messages to the terminal console
function setStatus(message, type = 'info') {
    const statusBox = document.getElementById('status');
    if (!statusBox) return;
    
    statusBox.textContent = message;
    
    if (type === 'error') {
        statusBox.style.color = '#ff5f57';
    } else if (type === 'success') {
        statusBox.style.color = '#25d69a';
    } else {
        statusBox.style.color = '#38bdf8';
    }
}

// -------------------------------------------------------------
// STORED FILES MANAGER (UI RENDERER & DATABASE SYNC)
// -------------------------------------------------------------
function addStoredFileToList(fileName, storageType = 'AWS_S3_NORMAL', timestampStr = null) {
    if (!fileName) return;

    const container = document.getElementById('storedFilesContainer');
    if (!container) return;

    // Remove placeholder empty text if present
    const noFilesMsg = container.querySelector('.no-files-text');
    if (noFilesMsg) {
        noFilesMsg.remove();
    }

    const displayTime = timestampStr || new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const isSecure = storageType === 'CLOUDFLARE_SECURE';
    const badgeHtml = isSecure 
        ? `<span class="badge-r2"><i class="fa-solid fa-lock"></i> SECURED (R2)</span>`
        : `<span class="badge-s3"><i class="fa-brands fa-aws"></i> STANDARD (S3)</span>`;

    const iconColor = isSecure ? '#38bdf8' : '#ff9900';

    const row = document.createElement('div');
    row.className = 'file-item-row';
    row.innerHTML = `
        <div class="file-item-info" style="display: flex; align-items: center; gap: 10px;">
            <i class="fa-solid ${isSecure ? 'fa-shield-halved' : 'fa-file-lines'}" style="color: ${iconColor}; font-size: 16px;"></i>
            <div>
                <div class="file-name-text" style="font-size: 13px; font-weight: 600; color: #f8fafc;">${fileName}</div>
                <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
                    <i class="fa-regular fa-clock" style="font-size: 9px; margin-right: 4px;"></i>${displayTime}
                </div>
            </div>
        </div>
        ${badgeHtml}
    `;
    
    container.insertBefore(row, container.firstChild);
}

// Fetch all historical uploaded files directly from MongoDB Atlas server
async function loadSavedFilesFromDatabase() {
    const userEmail = localStorage.getItem('cloudbox_user');
    if (!userEmail) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/user-files?email=${encodeURIComponent(userEmail)}`);
        const data = await response.json();

        if (response.ok && data.files) {
            const container = document.getElementById('storedFilesContainer');
            if (container) container.innerHTML = '';

            [...data.files].reverse().forEach(file => {
                const formattedTime = new Date(file.uploadedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                addStoredFileToList(file.fileName, file.storageType, formattedTime);
            });
        }
    } catch (err) {
        console.error('Error fetching file list from server:', err);
    }
}

// Save uploaded file metadata to MongoDB server permanently
async function recordFileUploadInDatabase(fileName, s3Key, storageType) {
    const userEmail = localStorage.getItem('cloudbox_user');
    if (!userEmail) return;

    try {
        await fetch(`${BACKEND_URL}/api/record-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: userEmail,
                fileName: fileName,
                s3Key: s3Key,
                storageType: storageType
            })
        });
    } catch (err) {
        console.error('Failed to record file in database:', err);
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

    // Route Protection
    if (!token && !isAuthPage) {
        window.location.href = 'login.html';
        return;
    }

    if (token && isAuthPage) {
        window.location.href = 'index.html';
        return;
    }

    // Set Avatar Initials
    const userGreeting = document.getElementById('userGreeting');
    if (userGreeting && user) {
        const parts = user.trim().split(' ');
        let initials = parts[0].charAt(0).toUpperCase();
        if (parts.length > 1) {
            initials += parts[parts.length - 1].charAt(0).toUpperCase();
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

    // Load saved files from MongoDB database
    loadSavedFilesFromDatabase();

    // Initialize file upload handlers
    initFileUploadHandlers();
});

// -------------------------------------------------------------
// 2. FILE SELECTION HANDLERS
// -------------------------------------------------------------
function initFileUploadHandlers() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', (e) => {
        if (e.target !== fileInput) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#6366f1';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'rgba(99,102,241,0.4)';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(99,102,241,0.4)';
        if (e.dataTransfer.files.length) {
            handleFileSelection(e.dataTransfer.files[0]);
        }
    });
}

function handleFileSelection(file) {
    if (!file) return;

    // Check size limit (Max 50 MB)
    const maxAllowedSize = 50 * 1024 * 1024;
    if (file.size > maxAllowedSize) {
        setStatus(`[ERROR] File exceeds 50 MB limit!`, 'error');
        return;
    }

    selectedFile = file;

    // Enable both mode buttons
    const uploadS3Btn = document.getElementById('uploadS3Btn');
    const uploadR2Btn = document.getElementById('uploadR2Btn');
    if (uploadS3Btn) uploadS3Btn.disabled = false;
    if (uploadR2Btn) uploadR2Btn.disabled = false;

    setStatus(`[FILE LOADED] ${file.name} (${(file.size / 1024).toFixed(2)} KB). Choose upload destination below.`, 'success');
}

// -------------------------------------------------------------
// 3. OPTION A: AWS S3 STANDARD UPLOAD (WITHOUT ENCRYPTION)
// -------------------------------------------------------------
const uploadS3Btn = document.getElementById('uploadS3Btn');
if (uploadS3Btn) {
    uploadS3Btn.addEventListener('click', async () => {
        if (!selectedFile) return;

        uploadS3Btn.disabled = true;
        setStatus('[AWS S3] Requesting presigned upload URL...', 'info');

        try {
            const response = await fetch(`${BACKEND_URL}/api/upload-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: selectedFile.name,
                    contentType: selectedFile.type || 'application/octet-stream'
                })
            });

            const data = await response.json();
            if (!response.ok || !data.uploadUrl) {
                throw new Error(data.error || 'Failed to get S3 URL.');
            }

            setStatus('[AWS S3] Transmitting file directly to AWS S3 bucket...', 'info');

            const s3Response = await fetch(data.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' },
                body: selectedFile
            });

            if (s3Response.ok) {
                setStatus(`[SUCCESS] Stored on AWS S3! Key: ${data.key}`, 'success');
                
                // Add to UI
                addStoredFileToList(selectedFile.name, 'AWS_S3_NORMAL');

                // Save in MongoDB Atlas
                await recordFileUploadInDatabase(selectedFile.name, data.key, 'AWS_S3_NORMAL');
            } else {
                throw new Error('S3 Direct PUT upload failed.');
            }
        } catch (err) {
            setStatus(`[S3 ERROR] ${err.message}`, 'error');
        } finally {
            uploadS3Btn.disabled = false;
        }
    });
}

// -------------------------------------------------------------
// 4. OPTION B: CLOUDFLARE R2 SECURE VAULT (AES-256 ENCRYPTED)
// -------------------------------------------------------------
const uploadR2Btn = document.getElementById('uploadR2Btn');
if (uploadR2Btn) {
    uploadR2Btn.addEventListener('click', async () => {
        if (!selectedFile) return;

        uploadR2Btn.disabled = true;
        setStatus('[ENCRYPTING] Encrypting file using Web Crypto API (AES-256)...', 'info');

        try {
            // Generate AES-256 Key
            const aesKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );

            const fileBuffer = await selectedFile.arrayBuffer();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, fileBuffer);

            setStatus('[R2 VAULT] Transmitting encrypted payload to Cloudflare R2...', 'info');

            // Send upload request to backend
            const response = await fetch(`${BACKEND_URL}/api/upload-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: `encrypted_${selectedFile.name}`,
                    contentType: 'application/octet-stream'
                })
            });

            const data = await response.json();
            if (!response.ok || !data.uploadUrl) {
                throw new Error(data.error || 'Failed to get upload URL.');
            }

            const r2Response = await fetch(data.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: encryptedBuffer
            });

            if (r2Response.ok) {
                setStatus(`[SUCCESS] Ultra-Secure Payload Stored in R2 Vault! Key: ${data.key}`, 'success');

                // Add to UI with R2 Badge
                addStoredFileToList(selectedFile.name, 'CLOUDFLARE_SECURE');

                // Record in MongoDB Atlas
                await recordFileUploadInDatabase(selectedFile.name, data.key, 'CLOUDFLARE_SECURE');
            } else {
                throw new Error('R2 PUT request failed.');
            }

        } catch (err) {
            setStatus(`[R2 ERROR] ${err.message}`, 'error');
        } finally {
            uploadR2Btn.disabled = false;
        }
    });
}
