const bcrypt = require('bcryptjs');
const db = require('../db/dbConnection');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const QRCode = require('qrcode');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: './config/email.env' });
require('dotenv').config({ path: './config/cloud.env' });
const busboy = require('busboy');

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper function to send an email
function sendEmail(to, subject, message, isHtml = false, callback) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        [isHtml ? 'html' : 'text']: message // Use 'html' or 'text' based on the isHtml flag
    };

    transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            console.error('Error sending email:', err);
            if (callback) callback(err);
        } else {
            console.log('Email sent:', info.response);
            if (callback) callback(null);
        }
    });
}

// Email verification function
function sendVerificationEmail(user, verificationCode) {
    const message = `Your verification code is: <b>${verificationCode}</b>. Please enter this code to verify your email.`;
    sendEmail(user.email, 'Email Verification', message, true); // Use HTML format
}

// Function to send the pin email
function sendPinEmail(email, pin, callback) {
    const message = `Your pin for accessing the private label is: ${pin}`;
    sendEmail(email, 'Your Access Pin', message, false, callback); // Use plain text format
}

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
    const { labelId } = req.body;

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
exports.verifyPin = (req, res) => {
    const { labelId, pin } = req.body;

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

        busboyInstance.on('file', (fieldname, file, origFilename, encoding, mimetype) => {
            console.log('File field:', fieldname, 'Filename:', origFilename, 'Mimetype:', mimetype);
            
            filename = typeof origFilename === 'object' && origFilename.filename ? origFilename.filename : origFilename;

            // Fallback mechanism for missing mimetype
            if (!mimetype) {
                console.warn('Mimetype is missing, attempting to infer from filename.');
                mimetype = inferMimeType(filename);
                
                if (!mimetype) {
                    console.error('Could not infer mimetype from filename:', filename);
                    return res.status(400).json({ success: false, message: 'Unsupported file type. Only audio and image files are allowed.' });
                }
                console.log('Inferred Mimetype:', mimetype);
            }

            // Check file type based on mimetype
            const allowedTypes = ['audio', 'image'];
            const fileCategory = mimetype.split('/')[0]; // Get 'audio' or 'image'
            
            if (allowedTypes.includes(fileCategory)) {
                fileType = fileCategory;
                fileField = fieldname;
                const chunks = [];
                
                file.on('data', (data) => {
                    chunks.push(data);
                });
                
                file.on('end', () => {
                    fileBuffer = Buffer.concat(chunks);
                    console.log('File upload complete, total size:', fileBuffer.length);
                });
            } else {
                console.error('Unsupported file type:', mimetype);
                return res.status(400).json({ success: false, message: 'Unsupported file type. Only audio and image files are allowed.' });
            }
        });

        busboyInstance.on('field', (fieldname, val) => {
            console.log('Field received:', fieldname, 'Value:', val);
            if (fieldname === 'label_name' || fieldname === 'titel19' || fieldname === 'titel110') req.body.label_name = val;
            if (fieldname === 'category_id') req.body.category_id = val;
            if (fieldname === 'public') req.body.public = val === 'true';
        });

        busboyInstance.on('finish', () => {
            if (!fileBuffer || !fileType) {
                console.error('File buffer or file type is missing.');
                return res.status(400).json({ success: false, message: 'File data is missing or unsupported file type.' });
            }

            // Call the appropriate function based on file type
            if (fileType === 'audio') {
                handleVoiceMemoUpload(req, res, fileBuffer, filename)
                .then(() => res.status(200).json({ success: true, redirectUrl: '/home' }))  // Success response
                .catch((error) => {
                    console.error('Error during audio upload:', error);
                    res.status(500).json({ success: false, message: 'Error uploading audio.' });
                });
            } 
            if (fileType === 'image') {
                handleImageUpload(req, res, fileBuffer, filename)
                    .then(() => res.status(200).json({ success: true, redirectUrl: '/home' }))  // Send JSON response on success
                    .catch((error) => {
                        console.error('Error during image upload:', error);
                        res.status(500).json({ success: false, message: 'Error uploading image.' });
                    });
            }
            else {
                res.status(400).json({ success: false, message: 'Unsupported file type.' });
            }
        });

        req.pipe(busboyInstance);
    } else {
        res.status(400).json({ success: false, message: 'Unsupported content type.' });
    }
};

// Function to handle the text memo upload
function handleTextMemoUpload(req, res) {
    console.log('--- [handleTextMemoUpload] Start of Function ---');
    const label_name = req.body['titel19'];
    const memo = req.body['start-typing-here-12'];
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
    return new Promise((resolve, reject) => {  // Wrap the logic in a promise
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

        // Upload the voice memo to Cloudinary
        cloudinary.uploader.upload_stream(
            {
                folder: cloudinaryFolder,
                resource_type: 'video',
                public_id: 'voice-memo',
            },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary upload error:', error.message);
                    return reject(new Error('Cloudinary upload error: ' + error.message));
                }

                const audioUrl = result.secure_url;
                console.log('Audio URL from Cloudinary:', audioUrl);

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
                        console.error(error.message);
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

// Helper function to upload files to Cloudinary
function uploadToCloudinary(fileBuffer, folder, resourceType) {
    console.log('--- [uploadToCloudinary] Start of Function ---');
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: resourceType,
                public_id: resourceType === 'audio' ? 'voice-memo' : 'image',
            },
            (error, result) => {
                if (error) {
                    return reject(new Error('Cloudinary upload error: ' + error.message));
                }
                resolve(result.secure_url);
            }
        ).end(fileBuffer);
    });
}

// Helper function to infer mimetype
function inferMimeType(filename) {
    console.log("[inferMimeType] function called with filename:", filename);
    if (filename.endsWith('.wav')) return 'audio/wav';
    if (filename.endsWith('.mp3')) return 'audio/mpeg';
    if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
    if (filename.endsWith('.png')) return 'image/png';
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
        db.query('CALL add_label(?, ?, ?, ?, ?, ?)', [label_name, user_id, category_id, memoUrl, isPublic, pin], (err, results) => {
            if (err) {
                reject(new Error('Error adding label to database: ' + err.message));
            } else {
                const labelId = results[0][0].label_id;
                console.log('[addLabelToDatabase] New Label ID:', labelId);
                resolve(labelId);
            }
        });
    });
}

// Function to generate QR code
function generateQRCode(data) {
    console.log('--- [generateQRCode] Start of Function ---');
    return new Promise((resolve, reject) => {
        QRCode.toDataURL(data, (err, url) => {
            if (err) {
                reject(new Error('Error generating QR Code: ' + err.message));
            } else {
                console.log('[generateQRCode] QR Code URL:', url);
                resolve(url);
            }
        });
    });
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

        // Helper function to delete all resources and the folder
        const deleteAllResourcesAndFolder = () => {
            // Step 1: Delete raw resources
            cloudinary.api.delete_resources_by_prefix(cloudinaryFolder, { resource_type: 'raw', invalidate: true }, (rawDeleteError, rawDeleteResult) => {
                if (rawDeleteError) {
                    console.error('Error deleting raw resources from Cloudinary:', rawDeleteError);
                } else {
                    console.log(`Deleted raw resources within folder: ${cloudinaryFolder}`, rawDeleteResult);
                }

                // Step 2: Delete image resources
                cloudinary.api.delete_resources_by_prefix(cloudinaryFolder, { resource_type: 'image', invalidate: true }, (imageDeleteError, imageDeleteResult) => {
                    if (imageDeleteError) {
                        console.error('Error deleting image resources from Cloudinary:', imageDeleteError);
                    } else {
                        console.log(`Deleted image resources within folder: ${cloudinaryFolder}`, imageDeleteResult);
                    }

                    // Step 3: Delete video resources
                    cloudinary.api.delete_resources_by_prefix(cloudinaryFolder, { resource_type: 'video', invalidate: true }, (videoDeleteError, videoDeleteResult) => {
                        if (videoDeleteError) {
                            console.error('Error deleting video resources from Cloudinary:', videoDeleteError);
                        } else {
                            console.log(`Deleted video resources within folder: ${cloudinaryFolder}`, videoDeleteResult);
                        }

                        // Step 4: Delete the folder after all resources have been deleted
                        cloudinary.api.delete_folder(cloudinaryFolder, (folderError, folderResult) => {
                            if (folderError) {
                                console.error('Error deleting folder from Cloudinary:', folderError);
                            } else {
                                console.log(`Deleted folder: ${cloudinaryFolder}`, folderResult);
                            }
                        });
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
