const db = require('../db/dbConnection');
const cloudinary = require('cloudinary').v2;
const { regenerateQRCode } = require('./editLabel');

// Function to update text memo
function updateTextMemo(labelId, newTextMemo, user_id, isPublic) {
    console.log('--------Updating text memo--------');
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

                    // Step 3: Upload the new memo to Cloudinary
                    cloudinary.uploader.upload_stream(
                        {
                            folder: `users/${user_id}/labels/${labelId}`,
                            public_id: 'memo',
                            resource_type: 'raw',
                            format: 'txt'
                        },
                        (uploadErr, uploadResult) => {
                            if (uploadErr) {
                                console.error('Error uploading new memo:', uploadErr);
                                return reject(new Error('Error uploading new memo.'));
                            }
                            const newMemoUrl = uploadResult.secure_url;
                            console.log('New memo uploaded successfully:', newMemoUrl);

                            // Step 4: Update the memo URL in the database
                            db.query('UPDATE labels SET memo = ? WHERE id = ?', [newMemoUrl, labelId], (dbUpdateErr) => {
                                if (dbUpdateErr) {
                                    console.error('Error updating memo URL in database:', dbUpdateErr);
                                    return reject(new Error('Error updating memo URL in database.'));
                                }

                                console.log('Memo URL updated successfully in the database.');

                                // Step 5: Regenerate QR code based on the current public status
                                regenerateQRCode(labelId, isPublic, newMemoUrl, user_id)
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
                    ).end(Buffer.from(newTextMemo, 'utf-8'));  // Send the text memo as a buffer
                })
                .catch((error) => {
                    console.error('Error deleting files from Cloudinary folder:', error);
                    reject(new Error('Error deleting all files from Cloudinary.'));
                });
        });
    });
}

// Helper function to delete all files in the Cloudinary folder
function deleteAllFilesFromCloudinaryFolder(folderPath) {
    return new Promise((resolve, reject) => {
        Promise.all([
            cloudinary.api.delete_resources_by_prefix(folderPath, { resource_type: 'raw' }),    // Delete text files
            cloudinary.api.delete_resources_by_prefix(folderPath, { resource_type: 'image' }),  // Delete images
            cloudinary.api.delete_resources_by_prefix(folderPath, { resource_type: 'video' })   // Delete voice memos
        ])
        .then(results => {
            console.log('All files deleted:', results);
            resolve();
        })
        .catch(error => {
            console.error('Error deleting files:', error);
            reject(error);
        });
    });
}

module.exports = {
    updateTextMemo,
    deleteAllFilesFromCloudinaryFolder
};