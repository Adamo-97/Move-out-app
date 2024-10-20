const db = require('../db/dbConnection');
const cloudinary = require('cloudinary').v2;
const { regenerateQRCode } = require('./editLabel');
const { deleteAllFilesFromCloudinaryFolder } = require('./updateTextMemo');
const { Writable } = require('stream');

// Helper function to convert stream to buffer
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const writable = new Writable({
            write(chunk, encoding, callback) {
                chunks.push(chunk);
                callback();
            }
        });

        writable.on('finish', () => resolve(Buffer.concat(chunks)));
        writable.on('error', reject);

        stream.pipe(writable);
    });
}
// Function to update image memo
function updateImageMemo(labelId, imageStream, user_id, isPublic) {
    console.log('--------Updating image memo--------');
    return new Promise((resolve, reject) => {
        // Step 1: Fetch the current memo URL from the database
        db.query('SELECT memo FROM labels WHERE id = ?', [labelId], (err, results) => {
            if (err) {
                console.error('Error fetching current memo:', err);
                return reject(new Error('Error fetching current memo.'));
            }
            if (results.length === 0) {
                return reject(new Error('Label not found.'));
            }

            const currentMemoUrl = results[0].memo;
            console.log('Fetched current memo URL:', currentMemoUrl);

            const folderPath = `users/${user_id}/labels/${labelId}`;

            // Step 2: Delete all files (text, image, voice) in the Cloudinary folder for this label
            deleteAllFilesFromCloudinaryFolder(folderPath)
                .then(() => {
                    console.log('All files in the folder deleted successfully.');

                    // Convert the stream to buffer before uploading
                    streamToBuffer(imageStream)
                        .then(buffer => {
                            // Step 3: Upload the new image to Cloudinary
                            cloudinary.uploader.upload_stream(
                                {
                                    folder: `users/${user_id}/labels/${labelId}`,
                                    public_id: 'image',
                                    resource_type: 'image',
                                    format: 'jpg'  // You can change the format based on your image type
                                },
                                (uploadErr, uploadResult) => {
                                    if (uploadErr) {
                                        console.error('Error uploading new image:', uploadErr);
                                        return reject(new Error('Error uploading new image.'));
                                    }
                                    const newImageUrl = uploadResult.secure_url;
                                    console.log('New image uploaded successfully:', newImageUrl);

                                    // Step 4: Update the memo URL in the database
                                    db.query('UPDATE labels SET memo = ? WHERE id = ?', [newImageUrl, labelId], (dbUpdateErr) => {
                                        if (dbUpdateErr) {
                                            console.error('Error updating memo URL in database:', dbUpdateErr);
                                            return reject(new Error('Error updating memo URL in database.'));
                                        }

                                        console.log('Image memo URL updated successfully in the database.');

                                        // Step 5: Regenerate QR code based on the current public status
                                        regenerateQRCode(labelId, isPublic, newImageUrl, user_id)
                                            .then(() => {
                                                console.log('QR code regenerated successfully.');
                                                resolve();
                                            })
                                            .catch((qrErr) => {
                                                console.error('Error regenerating QR code:', qrErr);
                                                reject(qrErr);
                                            });
                                    });
                                }
                            ).end(buffer);  // Use the buffer for the upload
                        })
                        .catch(err => {
                            console.error('Error converting stream to buffer:', err);
                            reject(new Error('Error processing image upload.'));
                        });
                })
                .catch((error) => {
                    console.error('Error deleting files from Cloudinary folder:', error);
                    reject(new Error('Error deleting all files from Cloudinary.'));
                });
        });
    });
}

// Function to handle errors and ensure only one error response is sent
function finishWithError(res, errorMessage) {
    if (!responseSent) {
        console.error(errorMessage);
        res.status(500).send(errorMessage);
        responseSent = true; // Ensure no further responses are sent
    }
}

module.exports = {
    updateImageMemo,
    finishWithError
};