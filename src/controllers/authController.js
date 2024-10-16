const bcrypt = require('bcryptjs');
const db = require('../db/dbConnection');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: './config/email.env' });
require('dotenv').config({ path: './config/cloud.env' });
const busboy = require('busboy');
const { sendVerificationEmail, sendPinEmail } = require('../helpers/emailHelpers');
const { handleTextMemoUpload, handleVoiceMemoUpload, handleImageUpload } = require('../helpers/addLable');

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Handling email verification
exports.verifyCode = (req, res) => {
    const { digit1, digit2, digit3, digit4 } = req.body;

    // Ensure all digits are present
    if (!digit1 || !digit2 || !digit3 || !digit4) {
        return res.render('verify', { message: 'Please enter the full 4-digit code.' });
    }

    const verificationCode = `${digit1}${digit2}${digit3}${digit4}`;

    // Call the stored procedure for email verification
    db.query('CALL verify_email(?)', [verificationCode], (err, results) => {
        if (err) {
            console.error('Error during verification:', err.stack || err); // Log full error stack if available
            return res.render('verify', { message: null });
        }

        if (results && results.affectedRows === 0) {
            return res.render('verify', { message: null });
        }

        // Verification was successful, redirect to home page
        res.redirect('/login');
    });
};

// Handle sign-up logic
exports.signup = (req, res) => {
    const { 'your-name2': name, 'your-email2': email, 'your-password2': password, 'confirm-password2': confirmPassword } = req.body;
    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

    if (!name || !email || !password || !confirmPassword) {
        return res.render('signup', { message: 'All fields are required!' });
    }

    if (!emailPattern.test(email)) {
        return res.render('signup', { message: 'Please enter a valid email address!' });
    }

    if (!passwordPattern.test(password)) {
        return res.render('signup', { message: 'Password: 6+ chars, uppercase, lowercase, number and a special charachter.' });
    }

    if (password !== confirmPassword) {
        return res.render('signup', { message: 'Passwords do not match!' });
    }

    db.query('SELECT email FROM users WHERE email = ?', [email], (err, results) => {
        if (err) {
            return res.render('signup', { message: 'Database error!' });
        }

        if (results.length > 0) {
            return res.render('signup', { message: 'Email already exists!' });
        }

        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) {
                return res.render('signup', { message: 'Error hashing password!' });
            }

            const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();

            db.query('CALL add_new_user(?, ?, ?, ?, ?)', [name, email, hashedPassword, verificationCode, false], (err) => {
                if (err) {
                    console.error('Error during user creation:', err.stack || err);
                    return res.render('signup', { message: 'Database error!' });
                }

                sendVerificationEmail({ email }, verificationCode);
                res.render('verify', { message: null });
            });
        });
    });
};

// Handle login logic
// TODO: Forward unverified users to the verification page
exports.login = (req, res) => {
    const email = req.body['your-email1'];  
    const password = req.body['your-password1'];

    // Query the database for the user by email
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.render('login', { message: 'Database error!' });
        }

        if (results.length === 0) {
            console.log("User not found for email:", email);
            return res.render('login', { message: 'User not found!' });
        }

        const user = results[0];
        console.log("User found:", user);

        if (!user.verified) {
            console.log("User email not verified:", email);

            // Generate a new verification code and update the user in the database
            const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();
            db.query('UPDATE users SET verification_code = ? WHERE id = ?', [verificationCode, user.id], (updateErr) => {
                if (updateErr) {
                    console.error('Error updating verification code:', updateErr);
                    return res.render('login', { message: 'Error sending verification code.' });
                }

                // Send the new verification email
                sendVerificationEmail({ email }, verificationCode);
            });

            // Render the login page with the message
            return res.render('login', {
                message: 'Please verify your email.'
            });
        }

        // Compare the password provided with the hashed password in the database
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                console.error('Error during password comparison:', err);
                return res.render('login', { message: 'Error during login!' });
            }

            if (isMatch) {
                req.session.userId = user.id;
                req.session.isAuthenticated = true;
                res.redirect('/home');
            } else {
                console.log("Incorrect password for email:", email);
                res.render('login', { message: 'Incorrect password!' });
            }
        });
    });
};

exports.scanLabel = (req, res) => {
    const { labelId } = req.query;  // Use req.query for GET parameters

    // Retrieve label information
    db.query('SELECT public, user_id FROM labels WHERE label_id = ?', [labelId], (err, results) => {
        if (err || results.length === 0) {
            console.error('Error retrieving label information:', err);
            return res.status(500).json({ success: false, message: 'Internal error.' });
        }

        const isPublic = results[0].public;
        const userId = results[0].user_id;

        // Check if the label is public
        if (isPublic) {
            console.log('This label is public. No PIN required.');
            return res.json({ success: true, message: 'This is a public label. No PIN required.' });
        }

        // The label is private; proceed with PIN generation
        const newPin = generatePin();

        // Update the pin in the database
        db.query('UPDATE labels SET pin = ? WHERE label_id = ?', [newPin, labelId], (updateErr) => {
            if (updateErr) {
                console.error('Error updating pin:', updateErr);
                return res.status(500).json({ success: false, message: 'Internal error.' });
            }

            // Retrieve the user's email
            db.query('SELECT email FROM users WHERE id = ?', [userId], (emailErr, emailResults) => {
                if (emailErr || emailResults.length === 0) {
                    console.error('Error retrieving user email:', emailErr);
                    return res.status(500).json({ success: false, message: 'Internal error.' });
                }

                const userEmail = emailResults[0].email;

                // Send the pin to the user's email
                sendPinEmail(userEmail, newPin, (sendErr) => {
                    if (sendErr) {
                        console.error('Error sending email:', sendErr);
                        return res.status(500).json({ success: false, message: 'Failed to send email.' });
                    }

                    // Successfully generated and sent pin
                    console.log('New pin sent to user email:', userEmail);
                    res.json({ success: true, redirectUrl: `/verify-pin?labelId=${labelId}` });
                });
            });
        });
    });
};

// Function to generate a 6-digit pin
function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Handle the PIN verification logic
exports.verifyPin = (req, res, pin) => {
    const { labelId } = req.body;

    if (!labelId || !pin) {
        return res.status(400).json({ success: false, message: 'Label ID and PIN are required.' });
    }

    // Check if the provided pin matches the one in the database
    db.query('SELECT pin, memo FROM labels WHERE label_id = ?', [labelId], (err, results) => {
        if (err || results.length === 0) {
            console.error('Error retrieving pin:', err);
            return res.status(500).json({ success: false, message: 'Internal error.' });
        }

        const storedPin = results[0].pin;
        const memoUrl = results[0].memo;

        if (storedPin !== pin) {
            return res.status(401).json({ success: false, message: 'Invalid PIN.' });
        }

        // PIN is valid; redirect to the memo URL
        res.json({ success: true, memoUrl });
    });
};

// Handle the access memo logic
exports.accessMemo = (req, res) => {
    const { labelId } = req.query;

    if (!labelId) {
        return res.status(400).send('Label ID is required.');
    }

    // Retrieve the label information
    db.query('SELECT public, memo FROM labels WHERE label_id = ?', [labelId], (err, results) => {
        if (err || results.length === 0) {
            console.error('Error retrieving label information:', err);
            return res.status(500).send('Internal error.');
        }

        const label = results[0];

        // If the label is public, directly redirect to the memo URL
        if (label.public) {
            return res.redirect(label.memo);
        }

        // The label is private; redirect to the PIN verification page
        res.redirect(`/verify-pin?labelId=${labelId}`);
    });
};

// Main addLabel function
exports.addLabel = (req, res) => {
    console.log('--- [addLabel] Start of Function ---');

    // Determine the content type
    const contentType = req.headers['content-type'];

    if (contentType && contentType.includes('application/json')) {
        // Handle text memo upload
        handleTextMemoUpload(req, res);
    } else if (contentType && contentType.includes('multipart/form-data')) {
        // Use Busboy to handle file uploads
        const busboyInstance = busboy({ headers: req.headers });
        let fileType = null;
        let fileBuffer = null;
        let fileField = null;
        let filename = null;

        // Listen for file event
        busboyInstance.on('file', (fieldname, file, origFilename, encoding, mimetype) => {
            console.log('File field:', fieldname, 'Filename:', origFilename, 'Mimetype:', mimetype);
            
            // Ensure filename is correctly set
            filename = typeof origFilename === 'object' && origFilename.filename ? origFilename.filename : origFilename;

            // Fallback for mimetype
            if (!mimetype) {
                console.warn('Mimetype is missing, attempting to infer from filename.');
                mimetype = inferMimeType(filename);

                if (!mimetype) {
                    console.error('Could not infer mimetype from filename:', filename);
                    return res.status(400).json({ success: false, message: 'Unsupported file type. Only audio and image files are allowed.' });
                }
                console.log('Inferred Mimetype:', mimetype);
            }

            // Check for supported file types
            const allowedTypes = ['audio', 'image'];
            const fileCategory = mimetype.split('/')[0]; // Get 'audio' or 'image'

            if (allowedTypes.includes(fileCategory)) {
                fileType = fileCategory;
                fileField = fieldname;
                const chunks = [];

                // Collect file data in chunks
                file.on('data', (data) => {
                    console.log('Receiving file data chunk...');
                    chunks.push(data);
                });

                // When file data is finished, concatenate chunks
                file.on('end', () => {
                    fileBuffer = Buffer.concat(chunks);
                    console.log('File upload complete, total size:', fileBuffer.length);
                });

            } else {
                console.error('Unsupported file type:', mimetype);
                return res.status(400).json({ success: false, message: 'Unsupported file type. Only audio and image files are allowed.' });
            }
        });

        // Handle fields (like label_name, category_id, etc.)
        busboyInstance.on('field', (fieldname, val) => {
            console.log('Field received:', fieldname, 'Value:', val);
            if (fieldname === 'label_name' || fieldname === 'titel19' || fieldname === 'titel110') req.body.label_name = val;
            if (fieldname === 'category_id') req.body.category_id = val;
            if (fieldname === 'public') req.body.public = val === 'true';
        });

        // Finish event handler for Busboy
        busboyInstance.on('finish', () => {
            if (!fileBuffer || !fileType) {
                console.error('File buffer or file type is missing.');
                return res.status(400).json({ success: false, message: 'File data is missing or unsupported file type.' });
            }

            // Check if file type is audio and process it accordingly
            if (fileType === 'audio') {
                handleVoiceMemoUpload(req, res, fileBuffer, filename)
                    .then(() => {
                        if (!res.headersSent) {
                            return res.status(200).json({ success: true, redirectUrl: '/home' });
                        }
                    })
                    .catch((error) => {
                        console.error('Error during audio upload:', error);
                        if (!res.headersSent) {
                            return res.status(500).json({ success: false, message: 'Error uploading audio.' });
                        }
                    });
            }
            else if (fileType === 'image') {
                handleImageUpload(req, res, fileBuffer, filename)
                    .then(() => {
                        if (!res.headersSent) { // Check if headers have already been sent
                            return res.status(200).json({ success: true, redirectUrl: '/home' });  // Success response
                        }
                    })
                    .catch((error) => {
                        console.error('Error during image upload:', error);
                        if (!res.headersSent) { // Prevent sending headers twice
                            return res.status(500).json({ success: false, message: 'Error uploading image.' });
                        }
                    });
            } else {
                if (!res.headersSent) { // Prevent sending headers twice
                    return res.status(400).json({ success: false, message: 'Unsupported file type.' });
                }
            }
        });

        req.pipe(busboyInstance);
    } else {
        res.status(400).json({ success: false, message: 'Unsupported content type.' });
    }
};

//function to delete label
exports.deleteLabel = (req, res) => {
    const labelId = req.body.labelId;
    const userId = req.session.userId;

    if (!labelId || !userId) {
        console.error('Label ID or User ID is missing.');
        return res.status(400).json({ success: false, message: 'Label ID and user authentication are required.' });
    }

    // Fetch the label_name from the database using the label ID
    db.query('SELECT label_name FROM labels WHERE id = ? AND user_id = ?', [labelId, userId], (err, results) => {
        if (err || results.length === 0) {
            console.error('Error fetching label data or label not found:', err);
            return res.status(500).json({ success: false, message: 'Error fetching label data.' });
        }

        const labelName = results[0].label_name;
        const cloudinaryFolder = `users/${userId}/labels/${labelName}`;
        console.log(`Attempting to delete resources within Cloudinary folder: ${cloudinaryFolder}`);

        // Helper function to delete all resources, subfolders, and the main folder
        const deleteAllResourcesAndFolder = () => {
            // Step 1: Delete all resources (raw, image, video)
            cloudinary.api.delete_resources_by_prefix(cloudinaryFolder, { invalidate: true }, (resourceDeleteError, resourceDeleteResult) => {
                if (resourceDeleteError) {
                    console.error('Error deleting resources from Cloudinary:', resourceDeleteError);
                    return;
                }
                console.log(`Deleted resources in folder: ${cloudinaryFolder}`, resourceDeleteResult);

                // Step 2: Delete any empty subfolders within the main folder
                cloudinary.api.sub_folders(cloudinaryFolder, (subFolderError, subFolderResult) => {
                    if (subFolderError) {
                        console.error('Error fetching subfolders from Cloudinary:', subFolderError);
                        return;
                    }
                    const subFolders = subFolderResult.folders;

                    // Check if subfolders exist
                    if (subFolders && subFolders.length > 0) {
                        console.log(`Deleting subfolders in folder: ${cloudinaryFolder}`, subFolders);

                        // Recursively delete all subfolders
                        subFolders.forEach(subFolder => {
                            cloudinary.api.delete_folder(`${cloudinaryFolder}/${subFolder.path}`, { skip_backup: true }, (subFolderDeleteError, subFolderDeleteResult) => {
                                if (subFolderDeleteError) {
                                    console.error(`Error deleting subfolder ${subFolder.path}:`, subFolderDeleteError);
                                } else {
                                    console.log(`Deleted subfolder: ${subFolder.path}`, subFolderDeleteResult);
                                }
                            });
                        });
                    }

                    // Step 3: Delete the main folder after ensuring it's empty
                    cloudinary.api.delete_folder(cloudinaryFolder, { skip_backup: true }, (folderDeleteError, folderDeleteResult) => {
                        if (folderDeleteError) {
                            console.error('Error deleting folder from Cloudinary:', folderDeleteError);
                        } else {
                            console.log(`Deleted folder: ${cloudinaryFolder}`, folderDeleteResult);
                        }
                    });
                });
            });
        };

        // Step 1: Delete all resources within the folder and then the folder itself
        deleteAllResourcesAndFolder();

        // Step 2: Delete the label from the database
        db.query('CALL delete_label(?)', [labelId], (err) => {
            if (err) {
                console.error('Error deleting label from database:', err);
                return res.status(500).json({ success: false, message: 'Error deleting label from database.' });
            }

            console.log('Label deleted from the database successfully.');
            // Respond to the user immediately
            res.status(200).json({ success: true, message: 'Label deleted successfully!' });
        });
    });
};

// Handle logout logic
exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.redirect('/home');
        }
        res.setHeader('Cache-Control', 'no-store');
        res.redirect('/login');
    });
};
