let selectedFile = null;
let fileMetadata = null;
let fileBlocks = [];
let encryptedBlocks = [];
let aesKey = null;

const BACKEND_URL = 'http://localhost:3000';

// DOM Elements
const statusDiv = document.getElementById('status');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const chunkSizeSelect = document.getElementById('chunkSize');
const segmentBtn = document.getElementById('segmentBtn');
const encryptBtn = document.getElementById('encryptBtn');
const uploadBtn = document.getElementById('uploadBtn');
const decryptBtn = document.getElementById('decryptBtn');

// Auth DOM Elements
const registerBtn = document.getElementById('registerBtn');
const loginBtn = document.getElementById('loginBtn');

function setStatus(message, type = 'info') {
  if (!statusDiv) return;
  const time = new Date().toLocaleTimeString();
  statusDiv.innerHTML = `[${time}] ${message}`;
  
  if (type === 'error') statusDiv.style.color = '#ef4444';
  else if (type === 'success') statusDiv.style.color = '#10b981';
  else statusDiv.style.color = '#38bdf8';
}

// -------------------------------------------------------------
// 1. MONGODB AUTHENTICATION LOGIC (Register & Login)
// -------------------------------------------------------------
if (registerBtn) {
  registerBtn.addEventListener('click', async () => {
    const username = document.getElementById('authUsername').value.trim();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value.trim();

    if (!username || !email || !password) {
      setStatus('Please fill in all registration fields.', 'error');
      return;
    }

    try {
      setStatus('Registering user to MongoDB local instance...');
      const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('Registration successful! User account created in MongoDB 🍃', 'success');
      } else {
        throw new Error(data.error || 'Registration failed');
      }
    } catch (err) {
      setStatus(`Auth Error: ${err.message}`, 'error');
    }
  });
}

if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value.trim();

    if (!email || !password) {
      setStatus('Please enter email and password to log in.', 'error');
      return;
    }

    try {
      setStatus('Authenticating credentials against MongoDB...');
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem('cloudbox_token', data.token);
        setStatus(`Welcome back, ${data.username}! Session active. 🍃`, 'success');
      } else {
        throw new Error(data.error || 'Login failed');
      }
    } catch (err) {
      setStatus(`Auth Error: ${err.message}`, 'error');
    }
  });
}

// -------------------------------------------------------------
// 2. FILE PROCESSING & CRYPTOGRAPHY LOGIC
// -------------------------------------------------------------
if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });
}

if (dropZone) {
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#06b6d4'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'rgba(255, 255, 255, 0.12)'; });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'rgba(255, 255, 255, 0.12)';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
}

function handleFile(file) {
  selectedFile = file;
  fileMetadata = { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified };
  fileBlocks = []; encryptedBlocks = []; aesKey = null;

  if (encryptBtn) encryptBtn.disabled = true;
  if (uploadBtn) uploadBtn.disabled = true;
  if (decryptBtn) decryptBtn.disabled = true;

  setStatus(`File selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB). Click 'Segment File'.`, 'info');
}

if (segmentBtn) {
  segmentBtn.addEventListener('click', async () => {
    if (!selectedFile) { setStatus('Please choose a file first.', 'error'); return; }

    const chunkSizeKB = parseInt(chunkSizeSelect ? chunkSizeSelect.value : 256, 10);
    const chunkSize = chunkSizeKB * 1024;
    fileBlocks = [];

    setStatus(`Segmenting file into ${chunkSizeKB} KB blocks...`);
    const arrayBuffer = await selectedFile.arrayBuffer();
    let offset = 0, blockIndex = 0;

    while (offset < arrayBuffer.byteLength) {
      fileBlocks.push({ index: blockIndex, data: arrayBuffer.slice(offset, offset + chunkSize) });
      offset += chunkSize; blockIndex++;
    }

    setStatus(`Segmentation complete! ${fileBlocks.length} blocks generated. Ready to Encrypt.`, 'success');
    if (encryptBtn) encryptBtn.disabled = false;
  });
}

if (encryptBtn) {
  encryptBtn.addEventListener('click', async () => {
    if (!fileBlocks.length) { setStatus('No blocks to encrypt. Please segment file first.', 'error'); return; }

    setStatus('Generating AES-256 key & encrypting blocks...');
    try {
      aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      encryptedBlocks = [];

      for (const block of fileBlocks) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, block.data);
        encryptedBlocks.push({ index: block.index, iv: Array.from(iv), data: Array.from(new Uint8Array(encryptedBuffer)) });
      }

      setStatus(`All ${encryptedBlocks.length} blocks encrypted with AES-256-GCM! Ready for AWS S3 Upload.`, 'success');
      if (uploadBtn) uploadBtn.disabled = false;
      if (decryptBtn) decryptBtn.disabled = false;
    } catch (err) {
      setStatus(`Encryption failed: ${err.message}`, 'error');
    }
  });
}

if (uploadBtn) {
  uploadBtn.addEventListener('click', async () => {
    if (!encryptedBlocks.length || !fileMetadata) {
      setStatus('No encrypted payload found.', 'error'); return;
    }

    uploadBtn.disabled = true;
    setStatus('Requesting AWS S3 Upload URL from Backend Server...');

    try {
      const response = await fetch(`${BACKEND_URL}/api/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: fileMetadata.name, contentType: 'application/json' })
      });
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

if (decryptBtn) {
  decryptBtn.addEventListener('click', async () => {
    if (!aesKey || !encryptedBlocks.length) { setStatus('No key or blocks found for decryption.', 'error'); return; }

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
