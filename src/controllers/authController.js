const bcrypt = require('bcryptjs');
const db = require('../db/dbConnection');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { promisify } = require('util');
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

// Email verification function
function sendVerificationEmail(user, verificationCode) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: 'Email Verification',
        html: `Your verification code is: <b>${verificationCode}</b>. Please enter this code to verify your email.`
    };

    transporter.sendMail(mailOptions, (err) => {
        if (err) {
            console.error('Error sending verification email:', err);
        }
    });
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

    if (!name || !email || !password || !confirmPassword) {
        return res.render('signup', { message: 'All fields are required!' });
    }

    if (!emailPattern.test(email)) {
        return res.render('signup', { message: 'Please enter a valid email address!' });
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
                    console.error('Error during user creation:', err.stack || err); // Log the full error stack if available
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
    // Use the front-end field names
    const email = req.body['your-email1'];  
    const password = req.body['your-password1'];

    // Query the database for the user by email
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.render('login', { message: 'Database error!' });
        }

        if (results.length === 0) {
            console.log("User not found for email:", email);  // Debug statement
            return res.render('login', { message: 'User not found!' });
        }

        const user = results[0];
        console.log("User found:", user);  // Debug statement

        if (!user.verified) {
            console.log("User email not verified:", email);  // Debug statement
            return res.render('login', { message: 'Please verify your email before logging in!' });
        }

        // Compare the password provided with the hashed password in the database
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                console.error('Error during password comparison:', err);
                return res.render('login', { message: 'Error during login!' });
            }

            if (isMatch) {
                req.session.userId = user.id;  // Store user ID in session
                req.session.isAuthenticated = true;  // Set authenticated flag
                res.redirect('/home');  // Redirect to home page
            } else {
                console.log("Incorrect password for email:", email);  // Debug statement
                res.render('login', { message: 'Incorrect password!' });
            }
        });
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

    console.log('Received values:', {
        label_name,
        memo,
        category_id,
        user_id,
        isPublic,
    });

    if (!user_id) {
        console.error('User not authenticated!');
        return res.status(401).json({ success: false, message: 'User not authenticated!' });
    }

    if (!label_name) {
        console.error('Label name is required!');
        return res.status(400).json({ success: false, message: 'Label name is required!' });
    }

    const cloudinaryFolder = `users/${user_id}/labels/${label_name}`;

    // Upload the memo to Cloudinary
    const memoUpload = cloudinary.uploader.upload_stream(
        {
            folder: cloudinaryFolder,
            public_id: 'memo',
            resource_type: 'raw'
        },
        (error, result) => {
            if (error) {
                console.error('Error uploading memo to Cloudinary:', error);
                return res.status(500).json({ success: false, message: 'Error uploading memo to cloud storage' });
            }

            const memoUrl = result.secure_url;
            console.log('[addLabel] Memo URL from Cloudinary:', memoUrl);
            handleMemoUpload(memoUrl);
        }
    );

    memoUpload.end(Buffer.from(memo, 'utf-8'));

    function handleMemoUpload(memoUrl) {
        // Call the stored procedure to add the label
        db.query('CALL add_label(?, ?, ?, ?, ?)', [label_name, user_id, category_id, memoUrl, isPublic], (err, results) => {
            if (err) {
                console.error('Error adding label:', err);
                return res.status(500).json({ success: false, message: `Error adding label: ${err.message}` });
            }

            const labelId = results[0][0].label_id;
            console.log('[handleMemoUpload] New Label ID:', labelId);

            // Generate a URL for the QR code that points to the general-complete page
            const qrData = `${req.protocol}://${req.get('host')}/general-complete?labelId=${labelId}`;
            console.log('[handleMemoUpload] QR Data for Code:', qrData);

            // Generate the QR code
            QRCode.toDataURL(qrData, (err, url) => {
                if (err) {
                    console.error('Error generating QR Code:', err);
                    return res.status(500).json({ success: false, message: 'Error generating QR Code' });
                }

                // Upload QR code to Cloudinary
                const qrStream = cloudinary.uploader.upload_stream(
                    {
                        folder: cloudinaryFolder,
                        public_id: 'qr_code',
                        resource_type: 'image'
                    },
                    (error, result) => {
                        if (error) {
                            console.error('Error uploading QR code to Cloudinary:', error);
                            return res.status(500).json({ success: false, message: 'Error uploading QR code to cloud storage' });
                        }

                        const qrUrl = result.secure_url;
                        console.log('[handleMemoUpload] QR Code URL from Cloudinary:', qrUrl);

                        // Store the QR code URL in the database
                        db.query('CALL generate_qr_code(?, ?)', [labelId, qrUrl], (err) => {
                            if (err) {
                                console.error('Error storing QR code:', err);
                                return res.status(500).json({ success: false, message: 'Error storing QR code' });
                            }
                        
                            // Successfully added the label and QR code
                            console.log('Label and QR code added successfully!');
                        
                            // Send JSON response with the redirect URL and labelId
                            return res.status(200).json({ 
                                success: true, 
                                labelId: labelId, 
                                redirectUrl: `/home?labelId=${labelId}&category_id=${category_id}` 
                            });
                        });
                    }
                );

                // Convert the base64 URL to a buffer and upload to Cloudinary
                const base64Data = url.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                qrStream.end(buffer);
            });
        });
    }
};

exports.addVoiceLabel = (req, res) => {
    const label_name = req.body['titel110']; // Note: Adjust field name to match your form
    const category_id = req.body.category_id;
    const user_id = req.session.userId;
    const isPublic = (req.body.public === true || req.body.public === 'true');
    const audioMemo = req.files.audioMemo; // Assuming `express-fileupload` is used for handling file uploads

    if (!user_id) {
        console.error('User not authenticated!');
        return res.status(401).json({ success: false, message: 'User not authenticated!' });
    }

    if (!label_name) {
        console.error('Label name is required!');
        return res.status(400).json({ success: false, message: 'Label name is required!' });
    }

    const cloudinaryFolder = `users/${user_id}/labels/${label_name}`;

    // Upload the audio memo to Cloudinary
    cloudinary.uploader.upload_stream(
        {
            folder: cloudinaryFolder,
            public_id: 'voice-memo',
            resource_type: 'video' // Use video resource type for audio
        },
        (error, result) => {
            if (error) {
                console.error('Error uploading audio memo to Cloudinary:', error);
                return res.status(500).json({ success: false, message: 'Error uploading audio memo to cloud storage' });
            }

            const audioUrl = result.secure_url;
            console.log('[addVoiceLabel] Audio URL from Cloudinary:', audioUrl);

            // Call the stored procedure to add the label
            db.query('CALL add_label(?, ?, ?, ?, ?)', [label_name, user_id, category_id, audioUrl, isPublic], (err, results) => {
                if (err) {
                    console.error('Error adding label:', err);
                    return res.status(500).json({ success: false, message: `Error adding label: ${err.message}` });
                }

                const labelId = results[0][0].label_id;
                console.log('[addVoiceLabel] New Label ID:', labelId);

                // Generate a URL for the QR code that points to the general-complete page
                const qrData = `${req.protocol}://${req.get('host')}/general-complete?labelId=${labelId}`;
                console.log('[addVoiceLabel] QR Data for Code:', qrData);

                // Generate the QR code
                QRCode.toDataURL(qrData, (err, url) => {
                    if (err) {
                        console.error('Error generating QR Code:', err);
                        return res.status(500).json({ success: false, message: 'Error generating QR Code' });
                    }

                    // Upload QR code to Cloudinary
                    const qrStream = cloudinary.uploader.upload_stream(
                        {
                            folder: cloudinaryFolder,
                            public_id: 'qr_code',
                            resource_type: 'image'
                        },
                        (error, result) => {
                            if (error) {
                                console.error('Error uploading QR code to Cloudinary:', error);
                                return res.status(500).json({ success: false, message: 'Error uploading QR code to cloud storage' });
                            }

                            const qrUrl = result.secure_url;
                            console.log('[addVoiceLabel] QR Code URL from Cloudinary:', qrUrl);

                            // Store the QR code URL in the database
                            db.query('CALL generate_qr_code(?, ?)', [labelId, qrUrl], (err) => {
                                if (err) {
                                    console.error('Error storing QR code:', err);
                                    return res.status(500).json({ success: false, message: 'Error storing QR code' });
                                }
                                
                                // Successfully added the label and QR code
                                console.log('Label and QR code added successfully!');
                                
                                // Send JSON response with the redirect URL and labelId
                                return res.status(200).json({ 
                                    success: true, 
                                    labelId: labelId, 
                                    redirectUrl: `/home?labelId=${labelId}&category_id=${category_id}` 
                                });
                            });
                        }
                    );

                    // Convert the base64 URL to a buffer and upload to Cloudinary
                    const base64Data = url.replace(/^data:image\/\w+;base64,/, '');
                    const buffer = Buffer.from(base64Data, 'base64');
                    qrStream.end(buffer);
                });
            });
        }
    ).end(audioMemo.data);
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

        // Helper function to delete all resources within the folder
        const deleteAllResources = (callback) => {
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

                        // Call the callback to proceed
                        callback();
                    });
                });
            });
        };

        // Step 1: Delete all resources within the folder and respond to the user
        deleteAllResources(() => {
            // Step 2: Delete the label from the database
            db.query('CALL delete_label(?)', [labelId], (err) => {
                if (err) {
                    console.error('Error deleting label from database:', err);
                    return res.status(500).json({ success: false, message: 'Error deleting label from database.' });
                }

                console.log('Label deleted from the database successfully.');
                // Respond to the user immediately
                res.status(200).json({ success: true, message: 'Label deleted successfully!' });

                // Step 3: Schedule folder deletion in the background
                setTimeout(() => {
                    console.log(`Attempting to delete the folder ${cloudinaryFolder} in the background...`);

                    cloudinary.api.delete_folder(cloudinaryFolder, (folderError, folderResult) => {
                        if (folderError) {
                            console.error('Error deleting folder from Cloudinary:', folderError);
                        } else {
                            console.log(`Deleted folder: ${cloudinaryFolder}`, folderResult);
                        }
                    });
                }, 300000); // 300000 ms = 5 minutes
            });
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
