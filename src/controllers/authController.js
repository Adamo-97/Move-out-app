const bcrypt = require('bcryptjs');
const db = require('../db/dbConnection');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { promisify } = require('util');
require('dotenv').config({ path: './config/email.env' });

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
    console.log('Request Body:', req.body); // Log the entire request body for debugging

    // Use the existing names to get the data
    const label_name = req.body['titel19'];
    const memo = req.body['start-typing-here-12'];
    const category_id = req.body.category_id;
    const user_id = req.session.userId; // Ensure the user is logged in and user ID is stored in session

    // Log the public status before conversion
    console.log('Raw Public Status:', req.body.public, 'Type:', typeof req.body.public);

    // Explicitly convert the public status to a boolean
    const isPublic = (req.body.public === true || req.body.public === 'true');

    // Debugging statements
    console.log('Label Name:', label_name);
    console.log('Category ID:', category_id);
    console.log('Memo:', memo);
    console.log('Public Status (Boolean):', isPublic);
    console.log('User ID:', user_id);

    // Check if user ID and label name are provided
    if (!user_id) {
        console.error('User not authenticated!');
        return res.status(401).json({ success: false, message: 'User not authenticated!' });
    }

    if (!label_name) {
        console.error('Label name is required!');
        return res.status(400).json({ success: false, message: 'Label name is required!' });
    }

    // Call the stored procedure to add the label, including the public status
    db.query('CALL add_label(?, ?, ?, ?, ?)', [label_name, user_id, category_id, memo, isPublic], (err) => {
        if (err) {
            console.error('Error adding label:', err);
            return res.status(500).json({ success: false, message: `Error adding label: ${err.message}` });
        }

        // Successfully added the label
        console.log('Label added successfully!');
        res.status(200).json({ success: true });
    });
};

exports.generateQRCode = (req, res) => {
    const { label_id, qr_data } = req.body;

    // Call the stored procedure to generate a QR code for the label
    db.query('CALL generate_qr_code(?, ?)', [label_id, qr_data], (err) => {
        if (err) {
            console.error(err);
            return res.render('error', { message: 'Error generating QR code!' });
        }

        res.redirect('/dashboard');  // Redirect to dashboard or wherever you want
    });
};

exports.archiveLabel = (req, res) => {
    const { label_id } = req.body;

    // Call the stored procedure to archive the label
    db.query('CALL archive_label(?)', [label_id], (err) => {
        if (err) {
            console.error(err);
            return res.render('error', { message: 'Error archiving label!' });
        }

        res.redirect('/dashboard');
    });
};

exports.editLabel = (req, res) => {
    const { label_id, label_name, category_id, memo } = req.body;

    // Call the stored procedure to edit the label
    db.query('CALL edit_label(?, ?, ?, ?)', [label_id, label_name, category_id, memo], (err) => {
        if (err) {
            console.error(err);
            return res.render('error', { message: 'Error editing label!' });
        }

        res.redirect('/dashboard');
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
