const cloudinary = require('cloudinary').v2;
const db = require('../db/dbConnection');
const QRCode = require('qrcode');

// Function to handle the text memo upload
function handleTextMemoUpload(req, res) {
    console.log('--- [handleTextMemoUpload] Start of Function ---');
    
    const label_name = req.body['titel19']  // General
                    || req.body['titel16']  // Fragile
                    || req.body['titel13'] // Hazard
                    || req.body['label_name']; // Edit General
    const memo = req.body['start-typing-here-12']  // General
            || req.body['start-typing-here-11']  // Fragile
            || req.body['start-typing-here-1'] // Hazard
            || req.body['memo']; // Edit textarea
    const category_id = req.body.category_id;
    const user_id = req.session.userId;  
    const isPublic = (req.body.public === true || req.body.public === 'true');
    const pin = isPublic ? null : req.body.pin; // Add pin conditionally
    console.log('Final Parsed Request Body:', req.body);

    console.log('Received values:', { label_name, memo, category_id, user_id, isPublic, pin });

    if (!user_id) {
        console.error('User not authenticated!');
        return res.status(401).json({ success: false, message: 'User not authenticated!' });
    }

    if (!label_name) {
        console.error('Label name is required!');
        return res.status(400).json({ success: false, message: 'Label name is required!' });
    }

    // Step 1: Add the label to the database first to get labelId
    addLabelToDatabase(label_name, user_id, category_id, null, isPublic, pin)
        .then(labelId => {
            // Now that labelId is available, create the folder path
            const cloudinaryFolder = `users/${user_id}/labels/${labelId}`;

            // Step 2: Upload the text memo to Cloudinary
            return uploadMemoToCloudinary(memo, cloudinaryFolder, isPublic)  // Correctly use 'authenticated' for private labels
                .then(memoUrl => ({ labelId, memoUrl, cloudinaryFolder })); // Pass values to the next step
        })
        .then(({ labelId, memoUrl, cloudinaryFolder }) => {
            // Step 3: Update the memo URL in the database now that we have it
            return updateLabelMemoInDatabase(labelId, memoUrl).then(() => ({ labelId, memoUrl, cloudinaryFolder }));
        })
        .then(({ labelId, memoUrl, cloudinaryFolder }) => {
            // Step 4: Generate the QR code based on the memo URL
            return generateQRCode(memoUrl, labelId).then(qrDataUrl => ({ labelId, qrDataUrl, cloudinaryFolder }));
        })
        .then(({ labelId, qrDataUrl, cloudinaryFolder }) => {
            // Step 5: Upload the QR code to Cloudinary
            return uploadQRCodeToCloudinary(qrDataUrl, cloudinaryFolder, labelId);
        })
        .then(({ labelId, qrUrl }) => {
            // Step 6: Store the QR code URL in the database
            return storeQRCodeInDatabase(labelId, qrUrl);
        })
        .then(({ labelId }) => {
            console.log('Label and QR code added successfully!');
            return res.redirect(`/home?labelId=${labelId}&category_id=${category_id}`);
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

        // Step 1: Add the label to the database first to get labelId (without memo at this point)
        addLabelToDatabase(label_name, user_id, category_id, null, isPublic)
            .then((labelId) => {
                console.log('New Label ID:', labelId);

                // Step 2: Create the folder path using the labelId
                const cloudinaryFolder = `users/${user_id}/labels/${labelId}`;

                // Step 3: Upload the voice memo (WebM audio) to Cloudinary as a 'video'
                return new Promise((resolveUpload, rejectUpload) => {
                    cloudinary.uploader.upload_stream(
                        {
                            folder: cloudinaryFolder,  // Create the folder based on labelId
                            resource_type: 'video',  // Use 'video' for WebM files, even if they are audio-only
                            public_id: 'voice-memo',
                            type: isPublic ? 'upload' : 'authenticated',  // Use 'authenticated' for private labels
                        },
                        (error, result) => {
                            if (error) {
                                console.error('Cloudinary upload error:', JSON.stringify(error, null, 2));
                                return rejectUpload(new Error('Cloudinary upload error: ' + error.message));
                            }

                            if (!result || !result.secure_url) {
                                console.error('Cloudinary upload failed: Missing secure_url in response:', result);
                                return rejectUpload(new Error('Cloudinary upload failed: Missing secure_url in response.'));
                            }

                            const audioUrl = result.secure_url;
                            console.log('Audio/Video URL from Cloudinary:', audioUrl);

                            // Step 4: Update the label with the memo URL
                            return updateLabelMemoInDatabase(labelId, audioUrl)
                                .then(() => resolveUpload({ labelId, audioUrl, cloudinaryFolder }));
                        }
                    ).end(fileBuffer);
                });
            })
            .then(({ labelId, audioUrl, cloudinaryFolder }) => {
                // Step 5: Generate the QR code based on the memo URL
                return generateQRCode(audioUrl, labelId)
                    .then(qrDataUrl => ({ labelId, qrDataUrl, cloudinaryFolder }));
            })
            .then(({ labelId, qrDataUrl, cloudinaryFolder }) => {
                // Step 6: Upload the QR code to Cloudinary
                return uploadQRCodeToCloudinary(qrDataUrl, cloudinaryFolder, labelId)
                    .then(({ qrUrl }) => ({ labelId, qrUrl }));
            })
            .then(({ labelId, qrUrl }) => {
                // Step 7: Store the QR code URL in the database
                return storeQRCodeInDatabase(labelId, qrUrl);
            })
            .then(({ labelId }) => {
                console.log('Label, memo, and QR code added successfully!');
                res.status(200).json({ success: true, labelId: labelId, redirectUrl: `/home?labelId=${labelId}&category_id=${category_id}` });
            })
            .catch(error => {
                console.error(error.message);
                res.status(500).json({ success: false, message: error.message });
            });
    });
}

// Function to handle image upload
function handleImageUpload(req, res, fileBuffer, filename) {
    return new Promise((resolve, reject) => {
        console.log('--- [handleImageUpload] Start of Function ---');
        const label_name = req.body.label_name;
        const category_id = req.body.category_id;
        const user_id = req.session.userId;
        const isPublic = req.body.public;  // Convert to boolean if necessary

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

        // Step 1: Add the label to the database first to get labelId
        addLabelToDatabase(label_name, user_id, category_id, null, isPublic)
            .then((labelId) => {
                // Now that labelId is available, create the folder path
                const cloudinaryFolder = `users/${user_id}/labels/${labelId}`;

                // Step 2: Upload the image to Cloudinary with the correct type
                return new Promise((uploadResolve, uploadReject) => {
                    cloudinary.uploader.upload_stream(
                        {
                            folder: cloudinaryFolder,
                            resource_type: 'image',
                            public_id: 'uploaded-image',
                            type: isPublic ? 'upload' : 'authenticated'  // use 'authenticated' for private labels
                        },
                        (error, result) => {
                            if (error) {
                                console.error('Cloudinary upload error:', error.message);
                                return uploadReject(new Error('Cloudinary upload error: ' + error.message));
                            }

                            const imageUrl = result.secure_url;
                            console.log('Image URL from Cloudinary:', imageUrl);

                            // Update the memo (image URL) in the database
                            return updateLabelMemoInDatabase(labelId, imageUrl).then(() => {
                                uploadResolve({ labelId, imageUrl, cloudinaryFolder });
                            });
                        }
                    ).end(fileBuffer);
                });
            })
            .then(({ labelId, imageUrl, cloudinaryFolder }) => {
                // Step 3: Generate the QR code based on the image URL
                return generateQRCode(imageUrl, labelId).then(qrDataUrl => ({ labelId, qrDataUrl, cloudinaryFolder }));
            })
            .then(({ labelId, qrDataUrl, cloudinaryFolder }) => {
                // Step 4: Upload the QR code to Cloudinary
                return uploadQRCodeToCloudinary(qrDataUrl, cloudinaryFolder, labelId);
            })
            .then(({ labelId, qrUrl }) => {
                // Step 5: Store the QR code URL in the database
                return storeQRCodeInDatabase(labelId, qrUrl);
            })
            .then(({ labelId }) => {
                console.log('Label and QR code added successfully!');
                resolve(labelId);  // Resolve with labelId
            })
            .catch(error => {
                console.error('Error during image or QR processing:', error.message);
                reject(error);  // Reject with error
            });
    });
}

// helper function to update the memo URL in the database
function updateLabelMemoInDatabase(labelId, memoUrl) {
    return new Promise((resolve, reject) => {
        const query = 'UPDATE labels SET memo = ? WHERE id = ?';
        db.query(query, [memoUrl, labelId], (err, result) => {
            if (err) {
                console.error('Error updating memo URL in database:', err.message);
                return reject(new Error('Error updating memo URL in database: ' + err.message));
            }
            resolve();
        });
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
    console.log('[generateQRCode] Label ID:', labelId);

    // Check if the memoUrl is public (i.e., it contains 'upload') or private ('authenticated')
    const isPublic = memoUrl.includes('/upload/');

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