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
        statusBox.style.color = '#38bdf8';
    }
}

// -------------------------------------------------------------
// PERSISTENT STORED FILES MANAGER (DATE & TIME ENHANCED)
// -------------------------------------------------------------
function getStorageKey() {
    const currentUser = localStorage.getItem('cloudbox_user') || 'default_user';
    return `cloudbox_files_${currentUser}`;
}

function addStoredFileToList(fileName, timestampStr = null) {
    if (!fileName) return;

    const container = document.getElementById('storedFilesContainer');
    if (!container) return;

    // Remove placeholder empty message if present
    const noFilesMsg = container.querySelector('.no-files-text');
    if (noFilesMsg) {
        noFilesMsg.remove();
    }

    // Format current date & time if not provided
    const displayTime = timestampStr || new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    // Check if filename already exists in the list UI
    const existingNames = Array.from(container.querySelectorAll('.file-name-text')).map(el => el.textContent.trim());
    if (!existingNames.includes(fileName)) {
        const row = document.createElement('div');
        row.className = 'file-item-row';
        row.innerHTML = `
            <div class="file-item-info">
                <i class="fa-solid fa-file-shield" style="color: #38bdf8; margin-right: 8px;"></i>
                <div>
                    <div class="file-name-text" style="font-size: 13px; font-weight: 600; color: #f8fafc;">${fileName}</div>
                    <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
                        <i class="fa-regular fa-clock" style="font-size: 9px; margin-right: 4px;"></i>${displayTime}
                    </div>
                </div>
            </div>
            <span style="font-size: 11px; color: #10b981; font-weight: 700; background: rgba(16, 185, 129, 0.1); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.2);">SECURED</span>
        `;
        
        // Prepend so the newest files appear at the top
        container.insertBefore(row, container.firstChild);
    }

    // Save object { name, time } into localStorage bound to the current user
    const storageKey = getStorageKey();
    let savedFiles = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const existsInStorage = savedFiles.some(item => typeof item === 'object' ? item.name === fileName : item === fileName);

    if (!existsInStorage) {
        savedFiles.unshift({ name: fileName, timestamp: displayTime });
        localStorage.setItem(storageKey, JSON.stringify(savedFiles));
    }
}

function loadSavedFiles() {
    const storageKey = getStorageKey();
    const savedFiles = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    if (savedFiles.length > 0) {
        // Render in reverse to maintain chronological order
        [...savedFiles].reverse().forEach(item => {
            if (typeof item === 'object' && item.name) {
                addStoredFileToList(item.name, item.timestamp);
            } else if (typeof item === 'string') {
                addStoredFileToList(item, 'Previously Uploaded');
            }
        });
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

    // Load any saved files for this user into the UI
    loadSavedFiles();

    // Initialize drag-and-drop & file input handlers
    initFileUploadHandlers();
});

// -------------------------------------------------------------
// 2. AUTHENTICATION HANDLERS
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
                setStatus('Login successful! Redirecting...', 'success');
                localStorage.setItem('cloudbox_token', data.token || 'cloudbox_session_active');
                localStorage.setItem('cloudbox_user', data.username || email.split('@')[0]);
                setTimeout(() => { window.location.href = 'index.html'; }, 800);
            } else {
                setStatus(`Login Failed: ${data.error || 'Invalid email or password.'}`, 'error');
            }
        } catch (err) {
            setStatus(`Connection Error: ${err.message}`, 'error');
        }
    });
}

// -------------------------------------------------------------
// 3. FILE SELECTION HANDLERS
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
        dropZone.style.borderColor = '#38bdf8';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'rgba(99,102,241,0.3)';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(99,102,241,0.3)';
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
    setStatus(`[FILE LOADED] ${file.name} (${(file.size / 1024).toFixed(2)} KB). Click "1. Encrypt Buffer (AES-256)" to proceed.`, 'success');
}

// -------------------------------------------------------------
// 4. CLIENT-SIDE ENCRYPTION PIPELINE
// -------------------------------------------------------------
const encryptBtn = document.getElementById('encryptBtn');
if (encryptBtn) {
    encryptBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        const uploadBtn = document.getElementById('uploadBtn');
        const decryptBtn = document.getElementById('decryptBtn');

        setStatus('[ENCRYPTING] Processing file using Web Crypto API (AES-256-GCM)...', 'info');
        encryptBtn.disabled = true;

        try {
            aesKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );

            const fileBuffer = await selectedFile.arrayBuffer();
            const chunkSize = 1024 * 1024;
            encryptedBlocks = [];

            for (let offset = 0; offset < fileBuffer.byteLength; offset += chunkSize) {
                const chunk = fileBuffer.slice(offset, offset + chunkSize);
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const encryptedChunk = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, chunk);
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

            setStatus('[ENCRYPTION COMPLETE] Encrypted payload ready for AWS transmission.', 'success');
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
// 5. AWS S3 PRESIGNED UPLOAD & FILE DISPLAY PIPELINE
// -------------------------------------------------------------
const uploadBtn = document.getElementById('uploadBtn');
if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
        if (!encryptedBlocks.length || !fileMetadata) {
            setStatus('Error: No encrypted payload ready.', 'error');
            return;
        }

        const uploadedName = fileMetadata.name;
        uploadBtn.disabled = true;
        setStatus('[CONNECTING] Requesting presigned URL from Render backend...', 'info');

        try {
            const response = await fetch(`${BACKEND_URL}/api/upload-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: uploadedName,
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
                setStatus(`[SUCCESS] Object stored safely in AWS S3! Key: ${data.key}`, 'success');
                
                // Add filename with timestamp to the UI panel instantly
                addStoredFileToList(uploadedName);
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
            setStatus('Error: Missing AES key or block data.', 'error');
            return;
        }

        decryptBtn.disabled = true;
        setStatus('[DECRYPTING] Restoring file chunks & verifying signature...', 'info');

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
