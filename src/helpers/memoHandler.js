const cloudinary = require('cloudinary').v2;

// Function to delete and upload new memo
const handleMemoUpdate = (currentMemoUrl, userId, labelId, memoType, memoData) => {
    return new Promise((resolve, reject) => {
        // Step 1: Check if the memo exists and delete the old memo from Cloudinary
        if (currentMemoUrl) {
            let resourceType = 'auto';

            // Determine resource type based on the current memo URL
            if (currentMemoUrl.endsWith('.txt')) {
                resourceType = 'raw';
            } else if (currentMemoUrl.endsWith('.jpg') || currentMemoUrl.endsWith('.png')) {
                resourceType = 'image';
            } else if (currentMemoUrl.endsWith('.webm')) {
                resourceType = 'video'; // Cloudinary treats audio as video
            }

            cloudinary.uploader.destroy(currentMemoUrl, { resource_type: resourceType }, (err, result) => {
                if (err) {
                    return reject(`Error deleting old memo: ${err}`);
                }
                console.log('Old memo deleted from Cloudinary:', result);
            });
        }

        // Step 2: Upload the new memo based on the memoType (text, image, or voice)
        const cloudinaryFolder = `users/${userId}/labels/${labelId}`;
        let uploadPromise;

        if (memoType === 'text') {
            // For text, resolve immediately since there's no upload involved
            uploadPromise = Promise.resolve({ secure_url: memoData });
        } else if (memoType === 'image') {
            const imageUpload = memoData; // Assuming memoData contains the file path for image
            uploadPromise = cloudinary.uploader.upload(imageUpload.tempFilePath, { folder: cloudinaryFolder });
        } else if (memoType === 'voice') {
            const voiceUpload = memoData; // Assuming memoData contains the file path for voice memo
            uploadPromise = cloudinary.uploader.upload(voiceUpload.tempFilePath, { folder: cloudinaryFolder, resource_type: 'video' });
        }

        // Ensure uploadPromise is defined for text, image, or voice memo
        if (uploadPromise) {
            uploadPromise
                .then(uploadResult => {
                    console.log('New memo uploaded:', uploadResult);
                    resolve(uploadResult.secure_url);
                })
                .catch(uploadErr => {
                    reject(`Error uploading new memo: ${uploadErr}`);
                });
        } else {
            reject('Unsupported memo type');
        }
    });
};

module.exports = {
    handleMemoUpdate
};
