const bcrypt = require('bcryptjs');
const db = require('../db/dbConnection');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const QRCode = require('qrcode');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: './config/email.env' });
require('dotenv').config({ path: './config/cloud.env' });

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

exports.addLabel = (req, res) => {
    console.log('--- [addLabel] Start of Function ---');
    console.log('Request Body:', req.body);

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

    // Main function flow
    uploadMemoToCloudinary(memo, cloudinaryFolder)
        .then(memoUrl => addLabelToDatabase(label_name, user_id, category_id, memoUrl, isPublic, pin)
            .then(labelId => ({ labelId, memoUrl })) // Pass both labelId and memoUrl to the next step
        )
        .then(({ labelId, memoUrl }) => generateQRCode(memoUrl).then(qrDataUrl => ({ labelId, qrDataUrl, cloudinaryFolder })))
        .then(({ labelId, qrDataUrl, cloudinaryFolder }) => uploadQRCodeToCloudinary(qrDataUrl, cloudinaryFolder, labelId))
        .then(({ labelId, qrUrl }) => storeQRCodeInDatabase(labelId, qrUrl))
        .then(({ labelId }) => {
            // Successfully added the label and QR code
            console.log('Label and QR code added successfully!');
            res.status(200).json({ success: true, labelId: labelId, redirectUrl: `/home?labelId=${labelId}&category_id=${category_id}` });
        })
        .catch(error => {
            console.error(error.message);
            res.status(500).json({ success: false, message: error.message });
        });
};

// Function to upload memo to Cloudinary
function uploadMemoToCloudinary(memo, cloudinaryFolder, isPublic) {
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

// Reusable function for uploading media (audio or other files) to Cloudinary
function uploadToCloudinary(fileBuffer, folderPath, publicId, resourceType) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folderPath,
                public_id: publicId,
                resource_type: resourceType
            },
            (error, result) => {
                if (error) {
                    reject(new Error(`Error uploading to Cloudinary: ${error.message}`));
                } else {
                    console.log(`[uploadToCloudinary] URL: ${result.secure_url}`);
                    resolve(result.secure_url);
                }
            }
        );
        uploadStream.end(fileBuffer);
    });
}

exports.addVoiceLabel = (req, res) => {
    const label_name = req.body['titel110']; // Adjust to match your form's field name
    const category_id = req.body.category_id;
    const user_id = req.session.userId;
    const isPublic = (req.body.public === true || req.body.public === 'true');
    const audioMemo = req.files.audioMemo; // Assuming express-fileupload is used
    const cloudinaryFolder = `users/${user_id}/labels/${label_name}`;

    console.log('Received values:', {
        label_name,
        category_id,
        user_id,
        isPublic,
        audioMemo
    });

    if (!user_id) {
        console.error('User not authenticated!');
        return res.status(401).json({ success: false, message: 'User not authenticated!' });
    }

    if (!label_name) {
        console.error('Label name is required!');
        return res.status(400).json({ success: false, message: 'Label name is required!' });
    }

    // Step 1: Upload audio memo to Cloudinary
    uploadToCloudinary(audioMemo.data, cloudinaryFolder, 'voice-memo', 'video')
        .then(audioUrl => {
            console.log('Audio URL from Cloudinary:', audioUrl);
            // Step 2: Add label to the database
            return addLabelToDatabase(label_name, user_id, category_id, audioUrl, isPublic, null); // No pin for audio labels
        })
        .then(labelId => {
            console.log('New Label ID:', labelId);
            // Step 3: Generate a URL for the QR code that points to the general-complete page
            const qrData = `${req.protocol}://${req.get('host')}/general-complete?labelId=${labelId}`;
            console.log('QR Data for Code:', qrData);
            return generateQRCode(qrData).then(qrDataUrl => ({ labelId, qrDataUrl }));
        })
        .then(({ labelId, qrDataUrl }) => {
            console.log('QR Data URL:', qrDataUrl);
            // Step 4: Upload QR code to Cloudinary
            return uploadQRCodeToCloudinary(qrDataUrl, cloudinaryFolder, labelId);
        })
        .then(({ labelId, qrUrl }) => {
            console.log('QR Code URL from Cloudinary:', qrUrl);
            // Step 5: Store the QR code URL in the database
            return storeQRCodeInDatabase(labelId, qrUrl);
        })
        .then(({ labelId }) => {
            console.log('Stored Label ID:', labelId);
            // Successfully added the voice label and QR code
            console.log('Voice label and QR code added successfully!');
            res.status(200).json({ success: true, labelId: labelId, redirectUrl: `/home?labelId=${labelId}&category_id=${category_id}` });
        })
        .catch(error => {
            console.error('Error:', error.message);
            res.status(500).json({ success: false, message: error.message });
        });
};

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
