const cloudinary = require('cloudinary').v2;
const db = require('../db/dbConnection');
const QRCode = require('qrcode');

// Function to handle the text memo upload
function handleTextMemoUpload(req, res) {
    console.log('--- [handleTextMemoUpload] Start of Function ---');
    const label_name = req.body['titel19']  // General
                    || req.body['titel16']  // Fragile
                    || req.body['titel13']; // Hazard
    const memo = req.body['start-typing-here-12']  // General
            || req.body['start-typing-here-11']  // Fragile
            || req.body['start-typing-here-1']; // Hazard
    const category_id = req.body.category_id;
    const user_id = req.session.userId;
    const isPublic = (req.body.public === true || req.body.public === 'true');
    const pin = isPublic ? null : req.body.pin; // Add pin conditionally
    const cloudinaryFolder = `users/${user_id}/labels/${label_name}`;

    console.log('Received values:', { label_name, memo, category_id, user_id, isPublic, pin });

    if (!user_id) {
        console.error('User not authenticated!');
        return res.status(401).json({ success: false, message: 'User not authenticated!' });
    }

    if (!label_name) {
        console.error('Label name is required!');
        return res.status(400).json({ success: false, message: 'Label name is required!' });
    }

    // Upload the text memo to Cloudinary
    uploadMemoToCloudinary(memo, cloudinaryFolder, isPublic)
        .then(memoUrl => addLabelToDatabase(label_name, user_id, category_id, memoUrl, isPublic, pin)
            .then(labelId => ({ labelId, memoUrl })) // Pass both labelId and memoUrl to the next step
        )
        .then(({ labelId, memoUrl }) => generateQRCode(memoUrl).then(qrDataUrl => ({ labelId, qrDataUrl, cloudinaryFolder })))
        .then(({ labelId, qrDataUrl, cloudinaryFolder }) => uploadQRCodeToCloudinary(qrDataUrl, cloudinaryFolder, labelId))
        .then(({ labelId, qrUrl }) => storeQRCodeInDatabase(labelId, qrUrl))
        .then(({ labelId }) => {
            console.log('Label and QR code added successfully!');
            res.status(200).json({ success: true, labelId: labelId, redirectUrl: `/home?labelId=${labelId}&category_id=${category_id}` });
        })
        .catch(error => {
            console.error(error.message);
            res.status(500).json({ success: false, message: error.message });
        });
}

// Function to handle the voice memo upload
function handleVoiceMemoUpload(req, res, fileBuffer, filename) {
    return new Promise((resolve, reject) => {
        console.log('--- [handleVoiceMemoUpload] Start of Function ---');
        const label_name = req.body.label_name;
        const category_id = req.body.category_id;
        const user_id = req.session.userId;
        const isPublic = req.body.public;
        const cloudinaryFolder = `users/${user_id}/labels/${label_name}`;

        console.log('Received values:', { label_name, category_id, user_id, isPublic });

        if (!user_id) {
            console.error('User not authenticated!');
            return reject(new Error('User not authenticated!'));
        }

        if (!label_name) {
            console.error('Label name is required!');
            return reject(new Error('Label name is required!'));
        }

        if (!fileBuffer) {
            console.error('File buffer is empty!');
            return reject(new Error('File is missing!'));
        }

        // Upload the voice memo (WebM audio) to Cloudinary as a 'video'
        cloudinary.uploader.upload_stream(
            {
                folder: cloudinaryFolder,
                resource_type: 'video',  // Use 'video' for WebM files, even if they are audio-only
                public_id: 'voice-memo',
            },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary upload error:', JSON.stringify(error, null, 2)); // Log full error response
                    return reject(new Error('Cloudinary upload error: ' + error.message));
                }

                if (!result || !result.secure_url) {
                    console.error('Cloudinary upload failed: Missing secure_url in response:', result);
                    return reject(new Error('Cloudinary upload failed: Missing secure_url in response.'));
                }

                const audioUrl = result.secure_url;
                console.log('Audio/Video URL from Cloudinary:', audioUrl);

                // Save to database and get the label ID
                addLabelToDatabase(label_name, user_id, category_id, audioUrl, isPublic)
                    .then((labelId) => {
                        console.log('New Label ID:', labelId);

                        // After adding label to DB, generate QR code and upload to Cloudinary
                        return generateQRCode(audioUrl)
                            .then((qrDataUrl) => uploadQRCodeToCloudinary(qrDataUrl, cloudinaryFolder, labelId))
                            .then(({ qrUrl }) => storeQRCodeInDatabase(labelId, qrUrl))
                            .then(() => resolve(labelId));  // Resolve the promise
                    })
                    .catch(error => {
                        console.error('Error saving to database:', error.message);
                        return reject(error);
                    });
            }
        ).end(fileBuffer);
    });
}

// Function to handle image upload
function handleImageUpload(req, res, fileBuffer, filename) {
    return new Promise((resolve, reject) => {
        console.log('--- [handleImageUpload] Start of Function ---');
        const label_name = req.body.label_name;
        const category_id = req.body.category_id;
        const user_id = req.session.userId;
        const isPublic = req.body.public;
        const cloudinaryFolder = `users/${user_id}/labels/${label_name}`;

        console.log('Received values:', { label_name, category_id, user_id, isPublic });

        if (!user_id) {
            console.error('User not authenticated!');
            return reject(new Error('User not authenticated!'));
        }

        if (!label_name) {
            console.error('Label name is required!');
            return reject(new Error('Label name is required!'));
        }

        if (!fileBuffer) {
            console.error('File buffer is empty!');
            return reject(new Error('File is missing!'));
        }

        // Upload the image to Cloudinary
        cloudinary.uploader.upload_stream(
            {
                folder: cloudinaryFolder,
                resource_type: 'image',
                public_id: 'uploaded-image',
            },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary upload error:', error.message);
                    return reject(new Error('Cloudinary upload error: ' + error.message));
                }

                const imageUrl = result.secure_url;
                console.log('Image URL from Cloudinary:', imageUrl);

                // Save to database and get the label ID
                addLabelToDatabase(label_name, user_id, category_id, imageUrl, isPublic)
                    .then((labelId) => {
                        console.log('New Label ID:', labelId);

                        // After adding label to DB, generate QR code and upload to Cloudinary
                        return generateQRCode(imageUrl)
                            .then((qrDataUrl) => uploadQRCodeToCloudinary(qrDataUrl, cloudinaryFolder, labelId))
                            .then(({ qrUrl }) => storeQRCodeInDatabase(labelId, qrUrl))
                            .then(() => resolve(labelId));  // Resolve the promise
                    })
                    .catch(error => {
                        console.error(error.message);
                        return reject(error);
                    });
            }
        ).end(fileBuffer);
    });
}

// Helper function to infer mimetype
function inferMimeType(filename) {
    console.log("[inferMimeType] function called with filename:", filename);
    
    // Audio file types
    if (filename.endsWith('.wav')) return 'audio/wav';
    if (filename.endsWith('.mp3')) return 'audio/mpeg';
    if (filename.endsWith('.webm')) return 'audio/webm';  // WebM audio format
    
    // Image file types
    if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
    if (filename.endsWith('.png')) return 'image/png';
    if (filename.endsWith('.gif')) return 'image/gif';      // GIF images
    if (filename.endsWith('.svg')) return 'image/svg+xml';  // SVG images
    if (filename.endsWith('.bmp')) return 'image/bmp';      // BMP images
    if (filename.endsWith('.tiff') || filename.endsWith('.tif')) return 'image/tiff';  // TIFF images
    
    // PDF file type
    if (filename.endsWith('.pdf')) return 'application/pdf';  // PDF format

    // Default case if no match
    return null;
}

// Function to upload memo to Cloudinary
function uploadMemoToCloudinary(memo, cloudinaryFolder, isPublic) {
    console.log('--- [uploadMemoToCloudinary] Start of Function ---');
    return new Promise((resolve, reject) => {
        const memoBuffer = Buffer.from(memo, 'utf-8');
        const memoStream = cloudinary.uploader.upload_stream(
            {
                folder: cloudinaryFolder,
                public_id: 'memo',
                resource_type: 'raw',
                format: 'txt',
                type: isPublic ? 'upload' : 'authenticated' // Use 'upload' for public, 'authenticated' for private
            },
            (error, result) => {
                if (error) {
                    reject(new Error('Error uploading memo to Cloudinary: ' + error.message));
                } else {
                    console.log('[uploadMemoToCloudinary] Memo URL:', result.secure_url);
                    resolve(result.secure_url);
                }
            }
        );
        memoStream.end(memoBuffer);
    });
}

// Function to add label to the database
function addLabelToDatabase(label_name, user_id, category_id, memoUrl, isPublic, pin) {
    console.log('--- [addLabelToDatabase] Start of Function ---');

    return new Promise((resolve, reject) => {
        // First, insert the label and get the labelId
        db.query('CALL add_label(?, ?, ?, ?, ?, ?)', 
            [label_name, user_id, category_id, memoUrl, isPublic, pin], 
            (err, results) => {
                if (err) {
                    reject(new Error('Error adding label to database: ' + err.message));
                } else {
                    const labelId = results[0][0].label_id;
                    console.log('[addLabelToDatabase] New Label ID:', labelId);

                    // Generate the verification URL for private labels
                    const verificationUrl = isPublic ? null : `http://localhost:3000/verify-pin?labelId=${labelId}`;

                    // Now, update the label with the verification URL for private labels
                    if (!isPublic) {
                        db.query('UPDATE labels SET verification_url = ? WHERE id = ?', 
                            [verificationUrl, labelId], 
                            (updateErr) => {
                                if (updateErr) {
                                    reject(new Error('Error updating label with verification URL: ' + updateErr.message));
                                } else {
                                    console.log('[addLabelToDatabase] Verification URL added:', verificationUrl);
                                    resolve(labelId);
                                }
                            });
                    } else {
                        resolve(labelId);
                    }
                }
            });
    });
}

// Function to generate QR code based on whether the label is public or private
function generateQRCode(memoUrl, labelId) {
    console.log('--- [generateQRCode] Start of Function ---');
    
    // Debugging: Log the data received
    console.log('[generateQRCode] Data received:', memoUrl);

    // Check if the memoUrl is public (i.e., it contains 'upload') or private ('authenticated')
    const isPublic = memoUrl.includes('/raw/upload/');

    if (isPublic) {
        console.log('[generateQRCode] Label is Public, generating QR for memo URL:', memoUrl);

        // Public label: Use the Cloudinary memo URL
        return new Promise((resolve, reject) => {
            QRCode.toDataURL(memoUrl, (err, url) => {
                if (err) {
                    console.error('Error generating QR Code for Public label:', err.message);
                    reject(new Error('Error generating QR Code: ' + err.message));
                } else {
                    console.log('[generateQRCode] Public QR Code URL:', url);
                    resolve(url);
                }
            });
        });

    } else {
        console.log('[generateQRCode] Label is Private, generating QR for verification URL.');
        
        // Private label: Generate QR code pointing to the verification URL
        const verificationUrl = `http://localhost:3000/verify-pin?labelId=${labelId}`;
        console.log('[generateQRCode] Verification URL:', verificationUrl);

        return new Promise((resolve, reject) => {
            QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: 'H' }, (err, url) => {
                if (err) {
                    console.error('Error generating QR Code for Private label:', err.message);
                    reject(new Error('Error generating QR Code: ' + err.message));
                } else {
                    console.log('[generateQRCode] Private QR Code URL:', url);
                    resolve(url);
                }
            });
        });
    }
}

// Function to upload QR code to Cloudinary
function uploadQRCodeToCloudinary(qrDataUrl, cloudinaryFolder, labelId) {
    console.log('--- [uploadQRCodeToCloudinary] Start of Function ---');
    return new Promise((resolve, reject) => {
        const qrStream = cloudinary.uploader.upload_stream(
            {
                folder: cloudinaryFolder,
                public_id: 'qr_code',
                resource_type: 'image'
            },
            (error, result) => {
                if (error) {
                    reject(new Error('Error uploading QR code to Cloudinary: ' + error.message));
                } else {
                    console.log('[uploadQRCodeToCloudinary] QR Code URL:', result.secure_url);
                    resolve({ labelId, qrUrl: result.secure_url });
                }
            }
        );
        const base64Data = qrDataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        qrStream.end(buffer);
    });
}

// Function to store QR code URL in the database
function storeQRCodeInDatabase(labelId, qrUrl) {
    console.log('--- [storeQRCodeInDatabase] Start of Function ---');
    return new Promise((resolve, reject) => {
        db.query('CALL generate_qr_code(?, ?)', [labelId, qrUrl], (err) => {
            if (err) {
                reject(new Error('Error storing QR code in database: ' + err.message));
            } else {
                console.log('[storeQRCodeInDatabase] QR Code stored successfully for Label ID:', labelId);
                resolve({ labelId });
            }
        });
    });
}

module.exports = {
    handleTextMemoUpload,
    handleVoiceMemoUpload,
    handleImageUpload,
    inferMimeType,
    uploadMemoToCloudinary,
    addLabelToDatabase,
    generateQRCode,
    uploadQRCodeToCloudinary,
    storeQRCodeInDatabase
};