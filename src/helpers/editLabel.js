const cloudinary = require('cloudinary').v2;
const db = require('../db/dbConnection');
const QRCode = require('qrcode');

// Function to regenerate QR code when public/private status changes
function regenerateQRCode(labelId, isPublic, memoUrl, user_id) {
    console.log(' ----- Regenerating QR Code -----');
    return new Promise((resolve, reject) => {
        const cloudinaryFolder = `users/${user_id}/labels/${labelId}`;
        const qrPublicId = `${cloudinaryFolder}/qr_code`;

        // Step 1: Delete all previous QR codes from the qr_codes table
        db.query('DELETE FROM qr_codes WHERE label_id = ?', [labelId], (err) => {
            if (err) {
                console.error('Error deleting old QR codes from the database:', err);
                return reject(new Error('Error deleting old QR codes from the database.'));
            }

            // Step 2: Delete the old QR code from Cloudinary
            cloudinary.uploader.destroy(qrPublicId, { resource_type: 'image' }, (cloudinaryErr, result) => {
                if (cloudinaryErr) {
                    console.error('Error deleting old QR code from Cloudinary:', cloudinaryErr);
                    return reject(new Error('Error deleting old QR code from Cloudinary.'));
                }
                console.log('Old QR code deleted successfully:', result);

                // Step 3: Generate a new QR code based on the public/private status
                const qrUrl = isPublic ? memoUrl : `http://192.168.0.172:3000/verify-pin?labelId=${labelId}`;
                generateQRCode(qrUrl, labelId)
                    .then(qrDataUrl => {
                        // Step 4: Upload the new QR code to Cloudinary
                        return uploadQRCodeToCloudinary(qrDataUrl, cloudinaryFolder, labelId);
                    })
                    .then(({ qrUrl }) => {
                        // Step 5: Store the new QR code in the database
                        return storeQRCodeInDatabase(labelId, qrUrl, isPublic);
                    })
                    .then(() => {
                        console.log('QR Code stored and label updated successfully');
                        
                        // Step 6: Update the public status in the labels table
                        db.query('UPDATE labels SET public = ? WHERE id = ?', [isPublic ? 1 : 0, labelId], (updateErr) => {
                            if (updateErr) {
                                console.error('Error updating public status in labels table:', updateErr);
                                return reject(new Error('Error updating public status in the labels table.'));
                            }
                            console.log('Public status updated successfully in the labels table.');
                            resolve();  // QR regeneration complete
                        });
                    })
                    .catch((error) => {
                        console.error('Error during QR code regeneration or storing in the database:', error);
                        reject(error);  // Handle any errors during the process
                    });
            });
        });
    });
}

// Helper function to generate a QR code
function generateQRCode(qrUrl, labelId) {
    return new Promise((resolve, reject) => {
        QRCode.toDataURL(qrUrl, (err, qrDataUrl) => {
            if (err) {
                return reject(new Error('Error generating QR code: ' + err.message));
            }
            resolve(qrDataUrl);
        });
    });
}

// Helper function to upload the QR code to Cloudinary
function uploadQRCodeToCloudinary(qrDataUrl, cloudinaryFolder, labelId) {
    return new Promise((resolve, reject) => {
        const qrStream = cloudinary.uploader.upload_stream(
            {
                folder: cloudinaryFolder,
                public_id: 'qr_code',
                resource_type: 'image'
            },
            (error, result) => {
                if (error) {
                    return reject(new Error('Error uploading QR code to Cloudinary: ' + error.message));
                }
                resolve({ qrUrl: result.secure_url });
            }
        );
        const base64Data = qrDataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        qrStream.end(buffer);
    });
}

// Helper function to store or update the QR code URL in the database and update verification URL for private labels
function storeQRCodeInDatabase(labelId, qrUrl, isPublic) {
    return new Promise((resolve, reject) => {
        const verificationUrl = isPublic ? null : `http://192.168.0.172:3000/verify-pin?labelId=${labelId}`;
        
        // Step 1: Check if the QR code already exists for the label
        db.query('SELECT id FROM qr_codes WHERE label_id = ?', [labelId], (err, results) => {
            if (err) {
                return reject(new Error('Error checking QR code existence in database: ' + err.message));
            }

            if (results.length > 0) {
                // QR code exists, update it
                const qrCodeId = results[0].id;
                db.query('UPDATE qr_codes SET qr_code_data = ?, generated_at = NOW() WHERE id = ?', [qrUrl, qrCodeId], (updateErr) => {
                    if (updateErr) {
                        return reject(new Error('Error updating QR code in database: ' + updateErr.message));
                    }
                    
                    // Step 2: Update the verification URL in the labels table for private labels
                    if (!isPublic) {
                        db.query('UPDATE labels SET verification_url = ? WHERE id = ?', [verificationUrl, labelId], (labelUpdateErr) => {
                            if (labelUpdateErr) {
                                return reject(new Error('Error updating verification URL in labels table: ' + labelUpdateErr.message));
                            }
                            resolve();
                        });
                    } else {
                        resolve(); // For public labels, no need to update the verification URL
                    }
                });
            } else {
                // QR code doesn't exist, insert a new one
                db.query('INSERT INTO qr_codes (label_id, qr_code_data, generated_at) VALUES (?, ?, NOW())', [labelId, qrUrl], (insertErr) => {
                    if (insertErr) {
                        return reject(new Error('Error inserting QR code in database: ' + insertErr.message));
                    }
                    
                    // Step 2: Update the verification URL in the labels table for private labels
                    if (!isPublic) {
                        db.query('UPDATE labels SET verification_url = ? WHERE id = ?', [verificationUrl, labelId], (labelUpdateErr) => {
                            if (labelUpdateErr) {
                                return reject(new Error('Error updating verification URL in labels table: ' + labelUpdateErr.message));
                            }
                            resolve();
                        });
                    } else {
                        resolve(); // For public labels, no need to update the verification URL
                    }
                });
            }
        });
    });
}

module.exports = {
    regenerateQRCode,
    generateQRCode,
    uploadQRCodeToCloudinary,
    storeQRCodeInDatabase
};
