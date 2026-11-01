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
