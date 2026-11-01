let selectedFile = null;
let fileMetadata = null;
let fileBlocks = [];
let encryptedBlocks = [];
let aesKey = null;

const BACKEND_URL = 'https://mini-project-claude.onrender.com';

// -------------------------------------------------------------
// 0. AUTHENTICATION & USER LOGOUT PIPELINE
// -------------------------------------------------------------
const currentUser = localStorage.getItem('cloudbox_user');

// Check if user is logged in (Redirect if unauthorized)
if (!currentUser && !window.location.pathname.includes('login.html') && !window.location.pathname.includes('register.html')) {
    window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    const userGreeting = document.getElementById('userGreeting');
    const logoutBtn = document.getElementById('logoutBtn');

    // Display User Greeting in Top Header
    if (userGreeting && currentUser) {
        userGreeting.innerText = `● Logged in as: ${currentUser}`;
    }

    // Attach Click Handler to Logout Button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('cloudbox_user');
            localStorage.removeItem('cloudbox_token');
            window.location.href = 'login.html';
        });
    }
});

// DOM Elements
const statusDiv = document.getElementById('status');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const chunkSizeSelect = document.getElementById('chunkSize');
const storePlainCheckbox = document.getElementById('storePlainToMongo');
const segmentBtn = document.getElementById('segmentBtn');
const encryptBtn = document.getElementById('encryptBtn');
const uploadBtn = document.getElementById('uploadBtn');
const decryptBtn = document.getElementById('decryptBtn');

function setStatus(message, type = 'info') {
    if (!statusDiv) return;
    const time = new Date().toLocaleTimeString();
    statusDiv.innerHTML = `[${time}] ${message}`;
    if (type === 'error') statusDiv.style.color = '#ef4444';
    else if (type === 'success') statusDiv.style.color = '#10b981';
    else statusDiv.style.color = '#38bdf8';
}

// -------------------------------------------------------------
// 1. FILE SELECTION & DROPZONE LOGIC
// -------------------------------------------------------------
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
    });
}

if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#06b6d4';
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
}

function handleFile(file) {
    selectedFile = file;
    fileMetadata = { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified };
    fileBlocks = [];
    encryptedBlocks = [];
    aesKey = null;

    if (segmentBtn) segmentBtn.disabled = false;
    if (encryptBtn) encryptBtn.disabled = true;
    if (uploadBtn) uploadBtn.disabled = false; // Always ready to upload if raw option chosen
    if (decryptBtn) decryptBtn.disabled = true;

    setStatus(`File selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB). Ready to segment or upload.`, 'info');
}

// -------------------------------------------------------------
// 2. FILE SEGMENTATION LOGIC
// -------------------------------------------------------------
if (segmentBtn) {
    segmentBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            setStatus('Please choose a file first.', 'error');
            return;
        }
        const chunkSizeKB = parseInt(chunkSizeSelect ? chunkSizeSelect.value : 256, 10);
        const chunkSize = chunkSizeKB * 1024;
        fileBlocks = [];
        setStatus(`Segmenting file into ${chunkSizeKB} KB blocks...`);

        const arrayBuffer = await selectedFile.arrayBuffer();
        let offset = 0, blockIndex = 0;
        while (offset < arrayBuffer.byteLength) {
            fileBlocks.push({ index: blockIndex, data: arrayBuffer.slice(offset, offset + chunkSize) });
            offset += chunkSize;
            blockIndex++;
        }
        setStatus(`Segmentation complete! ${fileBlocks.length} blocks generated. Ready to Encrypt.`, 'success');
        if (encryptBtn) encryptBtn.disabled = false;
    });
}

// -------------------------------------------------------------
// 3. AES-256-GCM ENCRYPTION LOGIC
// -------------------------------------------------------------
if (encryptBtn) {
    encryptBtn.addEventListener('click', async () => {
        if (!fileBlocks.length) {
            setStatus('No blocks to encrypt. Please segment file first.', 'error');
            return;
        }
        setStatus('Generating AES-256 key & encrypting blocks...');
        try {
            aesKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );

            encryptedBlocks = [];
            for (const block of fileBlocks) {
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const encryptedBuffer = await crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv },
                    aesKey,
                    block.data
                );
                encryptedBlocks.push({
                    index: block.index,
                    iv: Array.from(iv),
                    data: Array.from(new Uint8Array(encryptedBuffer))
                });
            }
            setStatus(`All ${encryptedBlocks.length} blocks encrypted with AES-256-GCM! Ready for AWS S3 Upload.`, 'success');
            if (uploadBtn) uploadBtn.disabled = false;
            if (decryptBtn) decryptBtn.disabled = false;
        } catch (err) {
            setStatus(`Encryption failed: ${err.message}`, 'error');
        }
    });
}

// -------------------------------------------------------------
// 4. UPLOAD PIPELINE (AWS S3 & DIRECT MONGODB RAW OPTION)
// -------------------------------------------------------------
if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile || !fileMetadata) {
            setStatus('No file selected.', 'error');
            return;
        }

        // OPTION A: Store Raw / Unencrypted File directly to MongoDB Atlas
        if (storePlainCheckbox && storePlainCheckbox.checked) {
            uploadBtn.disabled = true;
            setStatus('Reading file and uploading directly to MongoDB Atlas without encryption...');
            try {
                const reader = new FileReader();
                reader.readAsDataURL(selectedFile);
                reader.onload = async () => {
                    const base64Data = reader.result;
                    const response = await fetch(`${BACKEND_URL}/api/store-raw`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: currentUser || 'onkar',
                            fileName: fileMetadata.name,
                            fileType: fileMetadata.type,
                            fileData: base64Data
                        })
                    });
                    const data = await response.json();
                    if (response.ok && data.success) {
                        setStatus(`Saved raw file successfully into MongoDB Atlas! 🍃`, 'success');
                    } else {
                        throw new Error(data.error || 'Failed to save to MongoDB');
                    }
                    uploadBtn.disabled = false;
                };
            } catch (err) {
                setStatus(`MongoDB Save Error: ${err.message}`, 'error');
                uploadBtn.disabled = false;
            }
            return;
        }

        // OPTION B: Normal Encrypted AWS S3 Upload Pipeline
        if (!encryptedBlocks.length) {
            setStatus('No encrypted payload found. Please Segment & Encrypt first, or tick MongoDB Raw Save.', 'error');
            return;
        }

        uploadBtn.disabled = true;
        setStatus('Requesting AWS S3 Presigned Upload URL from Backend Server...');
        try {
            const response = await fetch(`${BACKEND_URL}/api/upload-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: fileMetadata.name, contentType: 'application/json' })
            });

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Backend server error. Check Render environment keys.");
            }

            const data = await response.json();
            if (!response.ok || !data.uploadUrl) throw new Error(data.error || 'Failed to get upload URL');

            const payload = { metadata: fileMetadata, blocks: encryptedBlocks };
            setStatus('Uploading encrypted package directly to AWS S3...');
            
            const s3Response = await fetch(data.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (s3Response.ok) {
                setStatus(`Uploaded to AWS S3 Bucket! Object Key: ${data.key}`, 'success');
            } else {
                throw new Error('Direct S3 upload failed');
            }
        } catch (err) {
            setStatus(`Cloud Upload Error: ${err.message}`, 'error');
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
            setStatus('No key or blocks found for decryption.', 'error');
            return;
        }
        decryptBtn.disabled = true;
        setStatus('Decrypting blocks and reconstructing file...');
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
            const restoredBlob = new Blob(decryptedParts, { type: fileMetadata.type || 'application/octet-stream' });
            const url = URL.createObjectURL(restoredBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `restored_${fileMetadata.name}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setStatus(`Decryption successful! Original file restored: restored_${fileMetadata.name}`, 'success');
        } catch (err) {
            setStatus(`Decryption Error: ${err.message}`, 'error');
        } finally {
            decryptBtn.disabled = false;
        }
    });
}
