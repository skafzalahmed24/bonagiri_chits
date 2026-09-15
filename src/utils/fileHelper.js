'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Safely deletes an uploaded file from the server's uploads folder
 * 
 * @param {string} filePathOrUrl Filename, relative path, or URL of the file
 * @returns {boolean} True if a file was deleted, false otherwise
 */
const deleteUploadedFile = (filePathOrUrl) => {
  if (!filePathOrUrl || typeof filePathOrUrl !== 'string') return false;

  try {
    let cleanPath = filePathOrUrl.trim();

    // If it's a full URL, strip out protocol and host
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
      try {
        const parsedUrl = new URL(cleanPath);
        cleanPath = parsedUrl.pathname;
      } catch (e) {
        cleanPath = cleanPath.replace(/^https?:\/\/[^\/]+/, '');
      }
    }

    // Strip leading slashes and backslashes
    cleanPath = cleanPath.replace(/^[\\\/]+/, '');

    // Root uploads folder in project root: <projectRoot>/uploads
    const uploadsRoot = path.resolve(__dirname, '../../uploads');

    // Possible location candidates
    const candidatePaths = [
      path.resolve(uploadsRoot, cleanPath),
      path.resolve(uploadsRoot, cleanPath.replace(/^uploads[\\\/]/i, '')),
      path.resolve(uploadsRoot, path.basename(cleanPath)),
      path.resolve(process.cwd(), cleanPath),
      path.resolve(process.cwd(), 'uploads', path.basename(cleanPath))
    ];

    // Attempt deletion from candidates
    for (const candPath of candidatePaths) {
      if (fs.existsSync(candPath)) {
        try {
          const stat = fs.lstatSync(candPath);
          if (stat.isFile()) {
            fs.unlinkSync(candPath);
            console.log(`[FILE HELPER] Successfully deleted uploaded file: ${candPath}`);
            return true;
          }
        } catch (unlinkErr) {
          console.error(`[FILE HELPER ERROR] Failed unlinking ${candPath}:`, unlinkErr.message);
        }
      }
    }

    console.log(`[FILE HELPER] File not found on disk (skipped): ${filePathOrUrl}`);
    return false;
  } catch (error) {
    console.error(`[FILE HELPER ERROR] Exception deleting file "${filePathOrUrl}":`, error.message);
    return false;
  }
};

module.exports = {
  deleteUploadedFile
};
