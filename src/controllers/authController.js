const bcrypt = require('bcryptjs');
const db = require('../db/dbConnection');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: './config/email.env' });
require('dotenv').config({ path: './config/cloud.env' });
const busboy = require('busboy');
const { sendVerificationEmail } = require('../helpers/emailHelpers');
const { handleTextMemoUpload, handleVoiceMemoUpload, handleImageUpload, inferMimeType, } = require('../helpers/addLable');
const { deleteResources, archiveFolder, deleteQRCode } = require('../helpers/deleteLabel');

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

                // Check if the user is an admin
                if (user.role === 'admin') {
                    // Redirect admin users to the admin page
                    res.redirect('/admin');
                } else {
                    // Redirect regular users to the home page
                    res.redirect('/home');
                }
            } else {
                console.log("Incorrect password for email:", email);
                res.render('login', { message: 'Incorrect password!' });
            }
        });
    });
};

// Main addLabel function
exports.addLabel = (req, res) => {
    console.log('--- [addLabel] Start of Function ---');

    // Determine the content type
    const contentType = req.headers['content-type'];
    console.log('Content-Type:', contentType);

    if (contentType && contentType.includes('application/json')) {
        console.log('Received JSON data:', req.body);
        // Handle text memo upload
        handleTextMemoUpload(req, res);
    } else if (contentType && contentType.includes('multipart/form-data')) {
        console.log('Received form data:', req.headers);
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
        console.error('Unsupported content type:', contentType);
        res.status(400).json({ success: false, message: 'Unsupported content type.' });
    }
};

// Main function to delete label
exports.deleteLabel = (req, res) => {
    const labelId = req.body.labelId;
    const user_Id = req.session.userId;

    if (!labelId || !user_Id) {
        console.error('Label ID or User ID is missing.');
        if (res && !res.headersSent) return res.status(400).json({ success: false, message: 'Label ID and user authentication are required.' });
        return; // Skip response if `res` is not active (background task)
    }

    // Fetch the label details from the database using the label ID
    db.query('SELECT label_name, public FROM labels WHERE id = ? AND user_id = ?', [labelId, user_Id], (err, results) => {
        if (err || results.length === 0) {
            console.error('Error fetching label data or label not found:', err);
            return res.status(500).json({ success: false, message: 'Error fetching label data.' });
        }

        const isPublic = results[0].public === 1;
        const cloudinaryFolder = `users/${user_Id}/labels/${labelId}`;

        console.log(`Attempting to delete resources within Cloudinary folder: ${cloudinaryFolder}`);

        // Step 1: Delete all resources (memo, QR code, etc.) in the folder
        deleteResources(cloudinaryFolder, isPublic)
            .then(() => deleteQRCode(cloudinaryFolder))
            .then(() => archiveFolder(cloudinaryFolder, user_Id, labelId, isPublic))
            .catch(error => {
                // Log error if archive step fails, but don't stop the process
                if (error.http_code === 400 && error.message.includes('already exists')) {
                    console.warn('Archiving error: Resource already exists. Skipping archiving for these resources.');
                } else {
                    console.error('Error during archiving process:', error);
                    // You could decide here whether to return an error response or just continue.
                }
            })
            .finally(() => {
                // Step 3: Delete the label from the database regardless of Cloudinary errors
                db.query('CALL delete_label(?)', [labelId], (dbErr) => {
                    if (dbErr) {
                        console.error('Error deleting label from database:', dbErr);
                        if (res && !res.headersSent) return res.status(500).json({ success: false, message: 'Error deleting label from database.' });
                        return; // Skip response if already sent
                    }
                
                    console.log('Label deleted from the database successfully.');
                    if (res && !res.headersSent) return res.status(200).json({ success: true, message: 'Label and associated resources deleted successfully!' });
                });
            });
    });
};

// Main function to fetch label by ID
exports.getLabelById = async function (labelId) {
    try {
        // Use the promise-based query method
        const [label] = await db.promise().query('SELECT * FROM labels WHERE id = ?', [labelId]);
        if (!label || label.length === 0) {
            throw new Error('Label not found');
        }
        return label[0]; // Return the first result
    } catch (error) {
        console.error('Error fetching label:', error);
        throw error;
    }
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
