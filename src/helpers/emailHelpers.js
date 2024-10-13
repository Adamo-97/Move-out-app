const nodemailer = require('nodemailer');
require('dotenv').config({ path: './config/email.env' });

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

module.exports = {
    sendEmail,
    sendVerificationEmail,
    sendPinEmail
};