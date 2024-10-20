const cloudinary = require('cloudinary').v2; // Ensure cloudinary is configured

// Helper function to delete resources
const deleteResources = (folderPath, isPublic) => {
    const resourceTypes = ['image', 'video', 'raw']; // These cover image, audio, and raw files (like text memos)
    const resourceTypeOption = isPublic ? 'upload' : 'authenticated'; // Handle public/private based on label type

    return Promise.all(resourceTypes.map(resourceType => {
        return new Promise((resolve, reject) => {
            cloudinary.api.resources({
                prefix: folderPath,
                resource_type: resourceType,
                type: resourceTypeOption, // 'upload' for public, 'authenticated' for private
            }, (error, result) => {
                if (error) {
                    console.error(`Error fetching ${resourceType} resources for deletion:`, error);
                    return reject(error);
                }

                const resources = result.resources;
                if (resources.length === 0) {
                    console.log(`No ${resourceType} resources found for deletion in folder ${folderPath}.`);
                    return resolve(); // No resources to delete
                }

                // Delete resources in the folder
                cloudinary.api.delete_resources_by_prefix(folderPath, {
                    resource_type: resourceType,
                    type: resourceTypeOption, // Maintain type (upload/authenticated)
                    invalidate: true, // Invalidate the CDN cache
                }, (deleteError, deleteResult) => {
                    if (deleteError) {
                        console.error(`Error deleting ${resourceType} resources in folder ${folderPath}:`, deleteError);
                        return reject(deleteError);
                    }

                    console.log(`Deleted ${resourceType} resources in folder: ${folderPath}`, deleteResult);
                    resolve(); // Resources deleted successfully
                });
            });
        });
    })).catch(deleteError => {
        console.error('Error during resource deletion process:', deleteError);
        throw deleteError;
    });
};

// Explicitly delete the QR code image bexause it has a different upload type
const deleteQRCode = (folderPath) => {
    // Extract the public_id for the QR code from the folderPath (remove the version and ensure correct format)
    const qrCodePublicId = `${folderPath}/qr_code`;
    
    return cloudinary.api.delete_resources([qrCodePublicId], { resource_type: 'image' })
        .then(result => {
            console.log(`Deleted QR code: ${qrCodePublicId}`, result);
            return result;
        })
        .catch(error => {
            console.error('Error deleting QR code:', error);
            throw error;  // Ensure error is caught later in the process
        });
};

// Helper function to move folder to archive
const archiveFolder = (sourceFolder, userId, labelId, isPublic) => {
    const archiveFolderPath = `users/${userId}/archived-labels/${labelId}`;
    const resourceTypes = ['image', 'video', 'raw']; // Handle images, videos, raw files

    return Promise.all(resourceTypes.map(resourceType => {
        return new Promise((resolve, reject) => {
            const resourceTypeOption = isPublic ? 'upload' : 'authenticated';

            cloudinary.api.resources({
                prefix: sourceFolder,
                resource_type: resourceType,
                type: resourceTypeOption, // 'upload' for public, 'authenticated' for private
            }, (error, result) => {
                if (error) {
                    console.error(`Error fetching ${resourceType} resources for archiving:`, error);
                    return reject(error);
                }

                const resources = result.resources;
                if (resources.length === 0) {
                    console.log(`No ${resourceType} resources found for archiving in folder ${sourceFolder}.`);
                    return resolve(); // No resources to move
                }

                // Move each resource to the archive folder
                Promise.all(resources.map(resource => {
                    const newPublicId = `${archiveFolderPath}/${resource.public_id.split('/').pop()}`; // Move to archive folder

                    return cloudinary.uploader.rename(resource.public_id, newPublicId, {
                        resource_type: resourceType,
                        type: resourceTypeOption, // Keep the same type (upload or authenticated)
                    }).then(() => {
                        console.log(`Archived ${resourceType} resource to ${newPublicId}`);
                    }).catch(archiveError => {
                        console.error(`Error archiving ${resourceType} resources:`, archiveError);
                        reject(archiveError);
                    });
                }))
                .then(() => resolve())
                .catch(archiveError => reject(archiveError));
            });
        });
    })).catch(error => {
        console.error('Error during archiving process:', error);
        throw error;
    });
};

module.exports = {
    deleteResources,
    archiveFolder,
    deleteQRCode,
};
