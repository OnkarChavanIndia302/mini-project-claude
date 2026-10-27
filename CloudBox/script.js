
'use strict';

const fileInput = document.getElementById('fileInput');
const blockSizeSelect = document.getElementById('blockSize');
const fileInfo = document.getElementById('fileInfo');
const blockCountElement = document.getElementById('blockCount');
const selectedSizeElement = document.getElementById('selectedSize');
const segmentBtn = document.getElementById('segmentBtn');
const encryptBtn = document.getElementById('encryptBtn');
const decryptBtn = document.getElementById('decryptBtn');
const downloadEncryptedBtn = document.getElementById('downloadEncryptedBtn');
const statusElement = document.getElementById('status');
const blockResults = document.getElementById('blockResults');

// Create the Upload to Cloud button
const uploadCloudBtn = downloadEncryptedBtn.cloneNode(false);
uploadCloudBtn.id = 'uploadCloudBtn';
uploadCloudBtn.textContent = 'Upload to Cloud';
uploadCloudBtn.disabled = true;
downloadEncryptedBtn.insertAdjacentElement('afterend', uploadCloudBtn);

let selectedFile = null;
let plainBlocks = [];
let encryptedBlocks = [];
let aesKey = null;
let fileMetadata = null;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getBlockSize() {
  return Number(blockSizeSelect.value);
}

function getBlockCount(fileSize, blockSize) {
  return fileSize === 0 ? 0 : Math.ceil(fileSize / blockSize);
}

function setStatus(message, type = '') {
  statusElement.textContent = message;
  statusElement.className = `status ${type}`.trim();
}

function clearProcessingState() {
  plainBlocks = [];
  encryptedBlocks = [];
  aesKey = null;
  fileMetadata = null;
  blockResults.replaceChildren();

  encryptBtn.disabled = true;
  decryptBtn.disabled = true;
  downloadEncryptedBtn.disabled = true;
  uploadCloudBtn.disabled = true;
}

function updateFileDetails() {
  selectedFile = fileInput.files && fileInput.files[0]
    ? fileInput.files[0]
    : null;

  clearProcessingState();

  if (!selectedFile) {
    fileInfo.textContent = 'No file selected yet.';
    blockCountElement.textContent = '—';
    selectedSizeElement.textContent = '—';
    segmentBtn.disabled = true;
    setStatus('Choose a file to start.');
    return;
  }

  const count = getBlockCount(selectedFile.size, getBlockSize());

  fileInfo.textContent =
    `File: ${selectedFile.name} | Size: ${formatBytes(selectedFile.size)} | Type: ${selectedFile.type || 'Unknown'}`;

  blockCountElement.textContent = count;
  selectedSizeElement.textContent = formatBytes(selectedFile.size);
  segmentBtn.disabled = false;

  setStatus(`File selected. Ready to segment ${count} block(s).`);
}

function updateBlockCount() {
  if (!selectedFile) return;

  blockCountElement.textContent =
    getBlockCount(selectedFile.size, getBlockSize());

  clearProcessingState();
  setStatus('Block size changed. Segment the file again.');
}

async function segmentFile() {
  if (!selectedFile) {
    setStatus('Please choose a file first.', 'error');
    return;
  }

  try {
    clearProcessingState();

    const blockSize = getBlockSize();
    const buffer = await selectedFile.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    plainBlocks = [];

    for (
      let start = 0, index = 0;
      start < bytes.length;
      start += blockSize, index++
    ) {
      const end = Math.min(start + blockSize, bytes.length);

      plainBlocks.push({
        index,
        data: bytes.slice(start, end),
        originalLength: end - start
      });
    }

    fileMetadata = {
      name: selectedFile.name,
      type: selectedFile.type || 'application/octet-stream',
      size: selectedFile.size,
      blockSize
    };

    renderBlockList(plainBlocks, 'Original block');

    encryptBtn.disabled = plainBlocks.length === 0;

    setStatus(
      `Segmentation complete: ${plainBlocks.length} block(s) created.`,
      'success'
    );

    if (selectedFile.size === 0) {
      setStatus('This file is empty. There are no blocks to encrypt.', 'error');
    }
  } catch (error) {
    console.error(error);
    setStatus(`Could not read the file: ${error.message}`, 'error');
  }
}

function renderBlockList(blocks, label) {
  blockResults.replaceChildren();

  if (!blocks.length) return;

  const heading = document.createElement('p');
  heading.className = 'hint';
  heading.textContent = `${label}:`;
  blockResults.appendChild(heading);

  blocks.forEach((block) => {
    const row = document.createElement('div');
    row.className = 'block-item';

    const name = document.createElement('span');
    name.textContent = `Block ${block.index + 1}`;

    const size = document.createElement('strong');
    size.textContent = formatBytes(block.data.length);

    row.append(name, size);
    blockResults.appendChild(row);
  });
}

async function encryptFileBlocks() {
  if (!plainBlocks.length || !fileMetadata) {
    setStatus('Segment a non-empty file before encryption.', 'error');
    return;
  }

  if (!window.isSecureContext || !window.crypto?.subtle) {
    setStatus(
      'Web Crypto API unavailable. Use localhost or HTTPS.',
      'error'
    );
    return;
  }

  encryptBtn.disabled = true;
  uploadCloudBtn.disabled = true;

  setStatus('Generating AES-256-GCM key and encrypting blocks...');

  try {
    aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    encryptedBlocks = [];

    for (const block of plainBlocks) {
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        block.data
      );

      encryptedBlocks.push({
        index: block.index,
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encryptedBuffer)),
        originalLength: block.originalLength
      });
    }

    renderBlockList(
      encryptedBlocks.map(block => ({
        index: block.index,
        data: new Uint8Array(block.data)
      })),
      'Encrypted block'
    );

    decryptBtn.disabled = false;
    downloadEncryptedBtn.disabled = false;
    uploadCloudBtn.disabled = false;

    setStatus(
      `Encryption complete: ${encryptedBlocks.length} block(s) encrypted using AES-256-GCM. Keep this page open to decrypt.`,
      'success'
    );
  } catch (error) {
    console.error(error);
    setStatus(`Encryption failed: ${error.message}`, 'error');
    encryptBtn.disabled = false;
  }
}

async function decryptAndRestore() {
  if (!aesKey || !encryptedBlocks.length || !fileMetadata) {
    setStatus('No encrypted blocks or key available. Encrypt the file first.', 'error');
    return;
  }

  decryptBtn.disabled = true;
  setStatus('Decrypting blocks and restoring the original file...');

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
      type: fileMetadata.type
    });

    const url = URL.createObjectURL(restoredBlob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `restored_${fileMetadata.name}`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setStatus(
      `Decryption successful. Downloaded restored_${fileMetadata.name}.`,
      'success'
    );
  } catch (error) {
    console.error(error);
    setStatus(`Decryption failed: ${error.message}`, 'error');
  } finally {
    decryptBtn.disabled = false;
  }
}

// Download a local demo package.
// WARNING: this package includes the decryption key.
async function downloadEncryptedPackage() {
  if (!encryptedBlocks.length || !fileMetadata || !aesKey) {
    setStatus('Encrypt the file before downloading the encrypted package.', 'error');
    return;
  }

  try {
    const rawKey = await crypto.subtle.exportKey('raw', aesKey);

    const packageObject = {
      format: 'CloudBox encrypted demo package v1',
      algorithm: 'AES-256-GCM',
      note: 'This demo package includes the decryption key. Keep it private.',
      file: fileMetadata,
      key: Array.from(new Uint8Array(rawKey)),
      blocks: encryptedBlocks
    };

    const blob = new Blob([JSON.stringify(packageObject)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${fileMetadata.name}.cloudbox-encrypted.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setStatus(
      'Demo package downloaded. It contains the decryption key; do not share it.',
      'success'
    );
  } catch (error) {
    console.error(error);
    setStatus(`Package download failed: ${error.message}`, 'error');
  }
}

// Upload encrypted data to AWS S3 using the local backend.
async function uploadEncryptedPackage() {
  if (!encryptedBlocks.length || !fileMetadata || !aesKey) {
    setStatus('Please segment and encrypt a file first.', 'error');
    return;
  }

  uploadCloudBtn.disabled = true;
  setStatus('Preparing encrypted package for AWS S3 upload...');

  try {
    // IMPORTANT: The AES key is deliberately NOT included in this package.
    const packageObject = {
      format: 'CloudBox encrypted package v1',
      algorithm: 'AES-256-GCM',
      file: fileMetadata,
      blocks: encryptedBlocks
    };

    const encryptedBlob = new Blob(
      [JSON.stringify(packageObject)],
      { type: 'application/json' }
    );

    // Request a temporary, presigned upload URL from the backend.
    const urlResponse = await fetch(
      'http://localhost:3000/api/upload-url',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName: `${fileMetadata.name}.cloudbox-encrypted.json`,
          contentType: 'application/json'
        })
      }
    );

    if (!urlResponse.ok) {
      throw new Error(
        `Could not get upload URL (HTTP ${urlResponse.status})`
      );
    }

    const { uploadUrl, key } = await urlResponse.json();

    if (!uploadUrl || !key) {
      throw new Error('Backend did not return uploadUrl and key.');
    }

    // Send only the encrypted package to S3.
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: encryptedBlob
    });

    if (!uploadResponse.ok) {
      throw new Error(`S3 upload failed (HTTP ${uploadResponse.status})`);
    }

    setStatus(
      `Encrypted file uploaded successfully to AWS S3. Object: ${key}`,
      'success'
    );
  } catch (error) {
    console.error('Cloud upload error:', error);

    setStatus(
      `Cloud upload failed: ${error.message}. Check backend, S3 CORS and AWS permissions.`,
      'error'
    );
  } finally {
    uploadCloudBtn.disabled = false;
  }
}

fileInput.addEventListener('change', updateFileDetails);
blockSizeSelect.addEventListener('change', updateBlockCount);
segmentBtn.addEventListener('click', segmentFile);
encryptBtn.addEventListener('click', encryptFileBlocks);
decryptBtn.addEventListener('click', decryptAndRestore);
downloadEncryptedBtn.addEventListener('click', downloadEncryptedPackage);
uploadCloudBtn.addEventListener('click', uploadEncryptedPackage);

if (!window.isSecureContext || !window.crypto?.subtle) {
  setStatus(
    'Web Crypto may be unavailable. Open the project through localhost or HTTPS.',
    'error'
  );
}
