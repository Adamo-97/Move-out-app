const express = require('express');
const passport = require('passport');
const router = express.Router();
const authController = require('../controllers/authController');
const db = require('../db/dbConnection');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const busboy = require('busboy');
const { createCanvas, loadImage } = require('canvas');
const { sendPinEmail } = require('../helpers/emailHelpers');

const { regenerateQRCode } = require('../helpers/editLabel');
const { updateTextMemo } = require('../helpers/updateTextMemo');
const { updateImageMemo, finishWithError } = require('../helpers/uploadImage'); // Import the new image upload function

// Middleware to protect routes
const ensureAuthenticated = (req, res, next) => {
    if (req.session.isAuthenticated) {
        return next();  // Proceed if the user is authenticated
    }
    res.redirect('/login');  // Redirect to login if not authenticated
};

// Route for the welcome/login page
router.get('/', (req, res) => {
    res.render('login', { message: null });
});

// Route for login page (in case users navigate directly to `/login`)
router.get('/login', (req, res) => {
    res.render('login', { message: null });
});
// Route for handling login
router.post('/login', authController.login);
// Route to initiate Google login
router.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}));

// Route to handle the callback from Google
router.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        // Successful authentication, redirect to home
        req.session.isAuthenticated = true;  // Mark the session as authenticated
        req.session.userId = req.user.id;  // Store the user ID in the session

        res.redirect('/home');  // Redirect to home after Google login
    });

// Route for rendering the admin dashboard
router.get('/admin', (req, res) => {
    if (req.session.isAuthenticated && req.session.userId) {
        const query = 'SELECT * FROM users WHERE id = ?';
        db.query(query, [req.session.userId], (err, results) => {
            if (err || results.length === 0) {
                console.error('Error fetching user:', err);
                return res.redirect('/login');
            }

            const user = results[0];

            if (user.role !== 'admin') {
                return res.redirect('/login');
            }

            // Fetch total users and active users
            const totalUsersQuery = 'SELECT COUNT(*) as totalUsers FROM users WHERE role = "user"';
            const activeUsersQuery = 'SELECT COUNT(*) as activeUsers FROM users WHERE is_active = 1 AND role = "user"';

            db.query(totalUsersQuery, (err, totalResults) => {
                if (err) {
                    console.error('Error fetching total users:', err);
                    return res.render('admin', { user, totalUsers: 0, activeUsers: 0, activePercentage: 0, users: [], notifications: [] });
                }

                db.query(activeUsersQuery, (err, activeResults) => {
                    if (err) {
                        console.error('Error fetching active users:', err);
                        return res.render('admin', { user, totalUsers: 0, activeUsers: 0, activePercentage: 0, users: [], notifications: [] });
                    }

                    const totalUsers = totalResults[0].totalUsers;
                    const activeUsers = activeResults[0].activeUsers;

                    // Calculate active user percentage
                    const activePercentage = (activeUsers / totalUsers) * 100;

                    // Fetch all users for the users table
                    db.query('CALL get_all_users()', (err, usersResult) => {
                        if (err) {
                            console.error('Error fetching users:', err);
                            return res.render('admin', { user, totalUsers, activeUsers, activePercentage, users: [], notifications: [] });
                        }

                        const users = usersResult[0]; // Assuming the result is an array of users

                        // Fetch notifications for the admin or global notifications
                        const notificationsQuery = `
                            SELECT DISTINCT message, type, is_global 
                            FROM notifications 
                            WHERE user_id = ? OR is_global = 1 OR sender_id = ? 
                            ORDER BY created_at DESC
                        `;

                        // Use user.id in the notifications query to fetch both global and admin-specific notifications
                        db.query(notificationsQuery, [user.id, user.id], (err, notifications) => {
                            if (err) {
                                console.error('Error fetching notifications:', err);
                                return res.render('admin', { user, totalUsers, activeUsers, activePercentage, users, notifications: [] });
                            }
                            // Render the admin dashboard with all the data
                            res.render('admin', { user, totalUsers, activeUsers, activePercentage, users, notifications });
                        });
                    });
                });
            });
        });
    } else {
        res.redirect('/login');
    }
});

// Route to deactivate a user
router.post('/admin/deactivate/:id', (req, res) => {
    const userId = req.params.id;
    
    // Call the stored procedure to deactivate the user
    const query = 'CALL deactivate_user_account(?)';
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error deactivating user:', err);
            return res.redirect('/admin');
        }

        res.redirect('/admin'); // Redirect back to the admin dashboard
    });
});
// Route to activate a user
router.post('/admin/activate/:id', (req, res) => {
    const userId = req.params.id;
    
    // Call the stored procedure to activate the user
    const query = 'CALL reactivate_user_account(?)';
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error activating user:', err);
            return res.redirect('/admin');
        }

        res.redirect('/admin'); // Redirect back to the admin dashboard
    });
});
// Route to send notification to a specific user with a selected category
router.post('/admin/send-notification', (req, res) => {
    console.log('--- [/admin/send-notification] Start of Function ---');
    const adminId = req.session.userId; // Assuming admin ID is stored in the session
    const userId = req.body.userId; // User ID from the hidden input field
    const message = req.body.message; // Notification message from the textarea
    const notifType = req.body.category; // Category from the hidden input field

    console.log('Admin ID:', adminId);
    console.log('User ID:', userId);
    console.log('Message:', message);
    console.log('Notification Type:', notifType);
    // Check if the user ID is provided
    if(userId) {
        console.log('Sending notification to user:', userId);
        // Call the stored procedure to send the notification
        const query = 'CALL send_notification_to_user(?, ?, ?, ?)';
        db.query(query, [adminId, userId, message, notifType], (err, results) => {
            if (err) {
                console.error('Error sending notification:', err);
                return res.redirect('/admin'); // Redirect back with an error
            }

            // Successfully sent the notification, redirect back
            res.redirect('/admin');
        });
    }

    // If the user ID is not provided, send a global notification
    else {
        console.log('Sending global notification');
        // Call the stored procedure to send the notification to all users
        const query = 'CALL send_notification_to_all(?, ?, ?)';
        db.query(query, [adminId, message, notifType], (err, results) => {
            if (err) {
                console.error('Error sending notification to all:', err);
                return res.redirect('/admin'); // Redirect back with an error
            }

            // Successfully sent the notification, redirect back
            res.redirect('/admin');
        });
    }
});
// Route to handle search/filtering of users
router.get('/admin/search', (req, res) => {
    const { query, status } = req.query;

    let searchQuery = `
        SELECT id, name, email, verified, role, is_active, 
        DATE_FORMAT(last_active, '%Y-%m-%d %H:%i:%s') AS last_active 
        FROM users WHERE role != 'admin'
    `;    
    const params = [];

    // Add search by ID, name, or email
    if (query) {
        searchQuery += ' AND (id LIKE ? OR name LIKE ? OR email LIKE ?)';
        const searchParam = `%${query}%`;
        params.push(searchParam, searchParam, searchParam);
    }

    // Add filtering by active/non-active status
    if (status === 'active') {
        searchQuery += ' AND is_active = 1';
    } else if (status === 'non-active') {
        searchQuery += ' AND is_active = 0';
    }

    // Execute the query
    db.query(searchQuery, params, (err, results) => {
        if (err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Return the filtered users as JSON
        res.json({ users: results });
    });
});

// Route for sign-up page
router.get('/signup', (req, res) => {
    res.render('signup', { message: null });
});
router.post('/signup', authController.signup);

// Route for rendering the email verification page (GET)
router.get('/verify', (req, res) => {
    res.render('verify', { message: null });
});
// Route for handling verification code submission (POST)
router.post('/verify', authController.verifyCode);
// DELETE request for label deletion
router.delete('/home', ensureAuthenticated, authController.deleteLabel);
// Route for handling logout
router.get('/logout', authController.logout);

// Route for the dashboard (after login)
router.get('/home', ensureAuthenticated, (req, res) => {
    const userId = req.session.userId; 

    if (!userId) {
        return res.redirect('/login'); // Redirect to login if the user is not authenticated
    }

    // First, fetch the user's name from the users table
    db.query('SELECT name FROM users WHERE id = ?', [userId], (err, userResult) => {
        if (err) {
            console.error('Error fetching user name:', err);
            return res.status(500).send('Server error');
        }

        const userName = userResult[0].name;

        // Call the stored procedure to get all labels for the logged-in user
        db.query('CALL get_user_labels(?)', [userId], (err, results) => {
            if (err) {
                console.error('Error fetching user boxes:', err);
                return res.status(500).send('Server error');
            }

            // The results from a stored procedure call are in the first element of the array
            const userBoxes = results[0];
            console.log('Fetched labels:', userBoxes); // Debug: Check if QR data is present
            // Fetch the user's notifications using the stored procedure
            db.query('CALL get_notifications_for_user(?)', [userId], (err, notificationResults) => {
                if (err) {
                    console.error('Error fetching notifications:', err);
                    return res.status(500).send('Server error');
                }

                const notifications = notificationResults[0];
            // Render the home page with the user's name and labels
            res.render('home', { labels: userBoxes, userName, notifications });
            });
        });
    });
});
// Route to mark notification as read
router.post('/notifications/mark-as-read/:id', (req, res) => {
    const notificationId = req.params.id;

    // Update the notification status to 'read'
    db.query('UPDATE notifications SET status = "read" WHERE id = ?', [notificationId], (err, result) => {
        if (err) {
            console.error('Error updating notification status:', err);
            return res.status(500).send('Server error');
        }

        // Return success response
        res.status(200).send('Notification marked as read');
    });
});
// Route to handle sharing the label by email
router.post('/share-label', (req, res) => {
    const { email, labelId } = req.body;

    // Debug to check incoming request
    console.log('Received request to share label:', { email, labelId });

    // Check if the email exists in the users table
    db.query('SELECT id FROM users WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Error checking email:', err);
            return res.status(500).json({ success: false, message: 'Server error' });
        }

        // Debug to check if the user was found
        console.log('User search results:', results);

        if (results.length === 0) {
            // User is not registered
            console.log('User not found:', email);
            return res.json({ success: false, message: 'User is not a registered user in MoveOUT app' });
        }

        const recipientId = results[0].id;
        const senderId = req.session.userId;

        // Debug to check IDs for sender and recipient
        console.log('Sharing label from sender:', senderId, ' to recipient:', recipientId);

        // Call the stored procedure to share the label with the recipient
        db.query('CALL share_label_with_user(?, ?, ?)', [senderId, recipientId, labelId], (err, result) => {
            if (err) {
                console.error('Error sharing label:', err);
                return res.status(500).json({ success: false, message: 'Failed to share label' });
            }

            // Debug to confirm successful sharing
            console.log('Label shared successfully with labelId:', labelId);
            
            // Success
            return res.json({ success: true, message: 'Label shared successfully!' });
        });
    });
});
// Route to handle accepting a shared label
router.post('/notifications/accept-label/:sharedLabelId', (req, res) => {
    const sharedLabelId = req.params.sharedLabelId;
    const userId = req.session.userId; // The user accepting the label

    console.log('Accepting shared label:', sharedLabelId);
    console.log('User ID:', userId);
    
    // Fetch the shared label information
    const fetchLabelQuery = `
        SELECT l.*, sl.label_id AS original_label_id, sl.id AS shared_label_id
        FROM shared_labels sl
        JOIN labels l ON sl.label_id = l.id
        WHERE sl.id = ? AND sl.recipient_id = ? AND sl.status = 'pending'
    `;

    db.query(fetchLabelQuery, [sharedLabelId, userId], (err, labelResult) => {
        if (err) {
            console.error('Error fetching shared label:', err);
            return res.status(500).json({ success: false, message: 'Error fetching shared label' });
        }

        if (labelResult.length === 0) {
            return res.status(404).json({ success: false, message: 'Label not found or already processed' });
        }

        const label = labelResult[0];

        // Copy the label to the new user
        db.query(
            'CALL add_label(?, ?, ?, ?, ?, ?)',
            [label.label_name, userId, label.category_id, label.memo, label.public, label.pin],
            (err, addLabelResult) => {
                if (err) {
                    console.error('Error adding label for new user:', err);
                    return res.status(500).json({ success: false, message: 'Error adding label' });
                }

                const newLabelId = addLabelResult[0][0].label_id;

                // Fetch the QR code data for the original label
                db.query('SELECT qr_code_data FROM qr_codes WHERE label_id = ?', [label.original_label_id], (err, qrResult) => {
                    if (err) {
                        console.error('Error fetching QR code:', err);
                        return res.status(500).json({ success: false, message: 'Error fetching QR code' });
                    }

                    const qrCodeData = qrResult[0].qr_code_data;

                    // Generate a new QR code for the new label
                    db.query('CALL generate_qr_code(?, ?)', [newLabelId, qrCodeData], (err, qrInsertResult) => {
                        if (err) {
                            console.error('Error generating QR code:', err);
                            return res.status(500).json({ success: false, message: 'Error generating QR code' });
                        }

                        // Update the status of the shared label to 'accepted'
                        db.query('UPDATE shared_labels SET status = "accepted" WHERE id = ?', [sharedLabelId], (err, updateResult) => {
                            if (err) {
                                console.error('Error updating shared label status:', err);
                                return res.status(500).json({ success: false, message: 'Error updating shared label status' });
                            }

                            // Mark the notification as "read"
                            db.query('UPDATE notifications SET status = "read" WHERE user_id = ? AND type = "label_share" AND message LIKE ?', [userId, `%shared with you by user%`], (err, notificationResult) => {
                                if (err) {
                                    console.error('Error marking notification as read:', err);
                                    return res.status(500).json({ success: false, message: 'Error marking notification as read' });
                                }

                                return res.status(200).json({ success: true, message: 'Label accepted successfully!' });
                            });
                        });
                    });
                });
            }
        );
    });
});
// Route to handle declining a shared label
router.post('/notifications/decline-label/:sharedLabelId', (req, res) => {
    const sharedLabelId = req.params.sharedLabelId;
    const userId = req.session.userId; // The user declining the label

    // Update the shared label status to 'declined'
    const updateQuery = 'UPDATE shared_labels SET status = ? WHERE id = ? AND recipient_id = ? AND status = "pending"';
    db.query(updateQuery, ['declined', sharedLabelId, userId], (err, result) => {
        if (err) {
            console.error('Error updating shared label status to declined:', err);
            return res.status(500).json({ success: false, message: 'Error declining label' });
        }

        // Check if the label was actually updated
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Label not found or already processed' });
        }

        // Mark the notification as "read"
        db.query('UPDATE notifications SET status = "read" WHERE user_id = ? AND type = "label_share" AND message LIKE ?', [userId, `%shared with you by user%`], (err, notificationResult) => {
            if (err) {
                console.error('Error marking notification as read:', err);
                return res.status(500).json({ success: false, message: 'Error marking notification as read' });
            }

            return res.status(200).json({ success: true, message: 'Label declined successfully' });
        });
    });
});

// Route to handle declining a shared label
router.post('/notifications/decline-label/:sharedLabelId', (req, res) => {
    const sharedLabelId = req.params.sharedLabelId;
    const userId = req.session.userId; // The user declining the label

    // Update the shared label status to 'declined'
    const updateQuery = 'UPDATE shared_labels SET status = ? WHERE id = ? AND recipient_id = ? AND status = "pending"';
    db.query(updateQuery, ['declined', sharedLabelId, userId], (err, result) => {
        if (err) {
            console.error('Error updating shared label status to declined:', err);
            return res.status(500).json({ success: false, message: 'Error declining label' });
        }

        // Check if the label was actually updated
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Label not found or already processed' });
        }

        return res.status(200).json({ success: true, message: 'Label declined successfully' });
    });
});

// Route for the 'Add Label' page
router.get('/new-lable', ensureAuthenticated, (req, res) => {
    const userId = req.session.userId; 

    if (!userId) {
        return res.redirect('/login'); // Redirect to login if the user is not authenticated
    }

    // First, fetch the user's name from the users table
    db.query('SELECT name FROM users WHERE id = ?', [userId], (err, userResult) => {
        if (err) {
            console.error('Error fetching user name:', err);
            return res.status(500).send('Server error');
        }

        // Assuming the user exists, extract the name
        const userName = userResult[0].name;

        // Call the stored procedure to get all labels for the logged-in user
        db.query('CALL get_user_labels(?)', [userId], (err, results) => {
            if (err) {
                console.error('Error fetching user boxes:', err);
                return res.status(500).send('Server error');
            }

            // The results from a stored procedure call are in the first element of the array
            const userBoxes = results[0];
            console.log('Fetched labels:', userBoxes); // Debug: Check if QR data is present

            // Render the home page with the user's name and labels
            res.render('new-lable', { labels: userBoxes, userName });
        });
    });
});
// Route for creating a new label
router.post('/new-lable', (req, res) => {

    authController.addLabel(req, res, (err) => {
        if (err) {
            console.error('Error creating label:', err);
            return res.status(500).send('Server error');
        }
        res.redirect('/home');
    });
});

// Route for the 'Create General Label' page
router.get('/general-lable', ensureAuthenticated, (req, res) => {
    res.render('general-lable', { query: req.query }); 
});
// Route for handling fragile label creation
router.get('/fragile-lable', ensureAuthenticated, (req, res) => {
    res.render('fragile-lable', { query: req.query }); 
});
// Route for handling hazard label creation
router.get('/hazard-lable', ensureAuthenticated, (req, res) => {
    res.render('hazard-lable', { query: req.query }); 
});
// Route for the 'Create Care Label' page
router.get('/care-lable', ensureAuthenticated, (req, res) => {
    res.render('care-lable', { query: req.query });
});

// Route for 'general-text' page
router.get('/general-text', ensureAuthenticated, (req, res) => {
    res.render('general-text', { query: req.query }); 
});
// Route for 'general-text' page
router.get('/fragile-text', ensureAuthenticated, (req, res) => {
    res.render('fragile-text', { query: req.query }); 
});
// Route for hazard text page
router.get('/hazard-text', ensureAuthenticated, (req, res) => {
    res.render('hazard-text', { query: req.query }); 
});

// Route for the voice page General
router.get('/general-voice', ensureAuthenticated, (req, res) => {
    res.render('general-voice', { query: req.query }); 
});
// Route for creating a new voice label General
router.post('/general-voice', ensureAuthenticated, authController.addLabel);
// Route for the voice page Fragile
router.get('/fragile-voice', ensureAuthenticated, (req, res) => {
    res.render('fragile-voice', { query: req.query }); 
});
//Route for creating a new voice label Fragile
router.post('/fragile-voice', ensureAuthenticated, authController.addLabel);
// Route for the voice page Hazard
router.get('/hazard-voice', ensureAuthenticated, (req, res) => {
    res.render('hazard-voice', { query: req.query }); 
});
//Route for creating a new voice label Hazard
router.post('/hazard-voice', ensureAuthenticated, authController.addLabel);

// Route for the image page General
router.get('/general-image', ensureAuthenticated, (req, res) => {
    res.render('general-image', { query: req.query }); 
});
// Route for creating a new image label general
router.post('/general-image', ensureAuthenticated, authController.addLabel);
// Route for the image page Fragile
router.get('/fragile-image', ensureAuthenticated, (req, res) => {
    res.render('fragile-image', { query: req.query }); 
});
// Router for creating a new image label fragile
router.post('/fragile-image', ensureAuthenticated, authController.addLabel);
// Route for the image page Hazard
router.get('/hazard-image', ensureAuthenticated, (req, res) => {
    res.render('hazard-image', { query: req.query }); 
});
// Route for creating a new image label hazard
router.post('/hazard-image', ensureAuthenticated, authController.addLabel);

// GET Route for displaying the label data for editing (General label)
router.get('/edit-lable-general', ensureAuthenticated, (req, res) => {
    console.log('--- [/edit-lable-general] Start of Function ---');
    const labelId = req.query.labelId;

    if (!labelId) {
        return res.status(400).send('Label ID is required.');
    }

    // Fetch the label data from the database using the labelId
    db.query('SELECT * FROM labels WHERE id = ?', [labelId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).send('Label not found');
        }

        const label = results[0];
        console.log('Label fetched:', label);  // Debugging to check if the label is fetched

        // Pass the label data to the EJS template for rendering
        res.render('edit-lable-general', { label });
    });
});
// Post Route for editing the general label
router.post('/edit-lable-general', ensureAuthenticated, (req, res) => {
    console.log('--- [/edit-lable-general POST] Start of Function ---');

    const busboyInstance = busboy({ headers: req.headers });
    const formData = {};  // Store form fields
    let fileBuffer = null;
    let fileType = null;
    let fileField = null;
    let filename = null;
    const userId = req.session.userId;  // Fetch userId from session

    console.log('User ID:', userId);
    console.log('Form Data:', req.body);

    // Busboy: Handling form fields
    busboyInstance.on('field', (fieldname, val) => {
        console.log(`Field [${fieldname}]: value: ${val}`);
        formData[fieldname] = val;
    });

    // Busboy: Handling file uploads (only for voice or image uploads)
    busboyInstance.on('file', (fieldname, file, origFilename, encoding, mimetype) => {
        console.log(`File [${fieldname}] received, Filename: ${origFilename}, Mimetype: ${mimetype}`);
        const chunks = [];
        filename = origFilename ? origFilename : null;
        fileField = fieldname;
        fileType = mimetype;

        // Buffer the file data
        file.on('data', (data) => {
            chunks.push(data);
        });

        file.on('end', () => {
            if (chunks.length > 0) {
                fileBuffer = Buffer.concat(chunks);
                console.log(`File upload complete. Total size: ${fileBuffer.length}`);
            } else {
                console.log('No file uploaded.');
            }
        });
    });

    busboyInstance.on('finish', async () => {
        console.log('Busboy finished parsing the form.');

        const oldLabelId = formData.labelId;
        const labelName = formData.titel12;
        const isPublic = formData.public === 'false' ? false : true;
        const textMemo = formData.textMemo;
        const voiceFile = formData.voiceUploadData;
        const imageFile = fileBuffer && filename ? { fileBuffer, filename, fileType } : null;

        console.log('Parsed Form Data:', { oldLabelId, labelName, isPublic, textMemo, voiceFile, imageFile });

        if (!oldLabelId || !userId) {
            console.error('Label ID or User ID is missing.');
            return res.redirect('/home');
        }

        // Step 1: Pass the new memo (text, voice, or image) and create the new label
        let memoToUse;

        if (textMemo) {
            // Text memo - handle as JSON
            memoToUse = {
                label_name: labelName,
                memo: textMemo,
                category_id: 3,
                user_id: userId,
                public: isPublic
            };
            console.log('Using new text memo:', memoToUse);
        
            // Step 1: Send as JSON to addLabel
            req.body = memoToUse;
            req.headers['content-type'] = 'application/json'; // Ensure content-type is JSON
        
            // Step 2: Delete the old label in the background
            setTimeout(() => {
                console.log(`Background deletion: Deleting old label with ID: ${oldLabelId}`);
                authController.deleteLabel({ ...req, body: { labelId: oldLabelId } }, null, (deleteErr) => {
                    console.log(`Deleting old label with ID: ${oldLabelId}`);
                    if (deleteErr) {
                        console.error(`Error deleting old label with ID ${oldLabelId}:`, deleteErr);
                    } else {
                        console.log(`Old label with ID: ${oldLabelId} deleted successfully`);
                    }
                });
            }, 0); // Perform deletion task without blocking
        
            // Step 3: Add new label after the old label is marked for deletion
            authController.addLabel(req, res, (createErr, newLabelId) => {
                if (createErr) {
                    console.error('Error creating new label:', createErr);
                    return res.redirect('/home'); // Redirect on error
                }
        
                console.log(`New label created successfully with ID: ${newLabelId}. Redirecting to home...`);
            });
        }
         else if (voiceFile || imageFile) {
            // Handle voice and image uploads separately
            // Pass them as multipart form data
            req.body.label_name = labelName;
            req.body.public = isPublic;
            req.body.fileBuffer = fileBuffer;
            req.body.filename = filename;

            console.log('Creating label with voice or image memo.');

            authController.addLabel(req, res, (createErr, newLabelId) => {
                if (createErr) {
                    console.error('Error creating new label:', createErr);
                    return res.redirect('/home');
                }

                console.log(`New label created successfully with ID: ${newLabelId}. Now deleting the old label...`);

                // Step 2: Delete the old label
                req.body.labelId = oldLabelId;

                authController.deleteLabel(req, res, (deleteErr) => {
                    if (deleteErr) {
                        console.error('Error deleting old label:', deleteErr);
                        return res.redirect('/home');
                    }

                    console.log('Old label deleted successfully');
                    return res.redirect('/home');
                });
            });
        }
    });

    // Pipe the request stream into Busboy
    req.pipe(busboyInstance);
});

// Route for edit Fragile label
router.get('/edit-lable-fragile', ensureAuthenticated, (req, res) => {
    res.render('edit-lable-fragile', { query: req.query }); 
});
// Route for edit Hazard label
router.get('/edit-lable-hazard', ensureAuthenticated, (req, res) => {
    res.render('edit-lable-hazard', { query: req.query }); 
});

// Generalized route for 'Complete' page (handles general, fragile, hazard)
router.get('/label-complete', ensureAuthenticated, (req, res) => {
    console.log('--- [/label-complete] Start of Function ---');

    const labelId = req.query.labelId;
    const categoryId = req.query.category_id;

    console.log('[label-complete] Label ID:', labelId);
    console.log('[label-complete] Category ID:', categoryId);

    if (!labelId) {
        console.error('[label-complete] Label ID is required.');
        return res.status(400).send('Label ID is required.');
    }

    if (!categoryId) {
        console.error('[label-complete] Category ID is required.');
        return res.status(400).send('Category ID is required.');
    }

    const query = `
        SELECT labels.label_name, qr_codes.qr_code_data 
        FROM labels 
        LEFT JOIN qr_codes ON labels.id = qr_codes.label_id 
        WHERE labels.id = ?
    `;

    db.query(query, [labelId], (err, results) => {
        if (err) {
            console.error('[label-complete] Error fetching label data:', err);
            return res.status(500).send('Server error');
        }

        console.log('[label-complete] Query results:', results);

        if (!results || results.length === 0) {
            console.log('[label-complete] No label found with the specified ID.');
            return res.status(404).send('Label not found');
        }

        const labelData = {
            label_name: results[0].label_name,
            qr_data: results[0].qr_code_data,
            labelId: labelId,
            categoryId: categoryId,
        };

        console.log('[label-complete] Label data being sent to template:', labelData);

        // Determine the label type based on the categoryId and render the correct template
        let template = '';
        switch (parseInt(categoryId)) {
            case 1:
                template = 'fragile-comple';
                break;
            case 2:
                template = 'hazard-comple';
                break;
            case 3:
                template = 'general-complete';
                break;
            default:
                console.error('[label-complete] Invalid Category ID.');
                return res.status(400).send('Invalid Category ID.');
        }
            // Check if the request is coming from Puppeteer for generating an image
        if (req.headers['user-agent'].includes('HeadlessChrome')) {
            // Extra condition for Puppeteer requests
            console.log('Request from Puppeteer detected, adjusting response for image generation');
            res.render(template, { label: labelData });
        } else {
            try {
                res.render(template, { label: labelData });
            } catch (renderError) {
                console.error(`[label-complete] Error rendering ${template}:`, renderError);
                return res.status(500).send('Error rendering the page.');
            }
        }
    });
});

// Router for generating an image of a label
router.get('/generate-image', ensureAuthenticated, async (req, res) => {
    const labelId = req.query.labelId;
    const categoryId = req.query.category_id;

    console.log('Received labelId:', labelId);
    console.log('Received categoryId:', categoryId);

    if (!labelId || !categoryId) {
        return res.status(400).send('labelId and category_id are required.');
    }

    try {
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        // Increase the scale factor to improve image quality
        await page.setViewport({
            width: 1200,  
            height: 800,  
            deviceScaleFactor: 5  
        });

        // Pass the session cookie to Puppeteer
        const cookies = req.headers.cookie;
        if (cookies) {
            await page.setCookie(...cookies.split(';').map(cookieStr => {
                const [name, value] = cookieStr.split('=');
                return { name: name.trim(), value: value.trim(), domain: 'localhost' };
            }));
        }

        const pageUrl = `http://localhost:3000/label-complete?labelId=${labelId}&category_id=${categoryId}`;
        console.log('Navigating to:', pageUrl);

        await page.goto(pageUrl, { waitUntil: 'networkidle0' });

        // Inject custom CSS to scale the title
        await page.addStyleTag({
            content: `
                .titel-text-FsKoEO {
                font-size: 2.5em !important;
                }
                .titel-text-sTNRHE{
                font-size: 2.5em !important;
                }
                .titel-text-SSIOQa{
                font-size: 2.5em !important;
                }
            `
        });

        // Select the relevant divs based on category_id (main-shape, qr-placeholder, titel-placeholder)
        const sectionsToCapture = await page.evaluate((categoryId) => {
            let mainShape, qrPlaceholder, titlePlaceholder;

            // Element selectors based on the categoryId
            switch (parseInt(categoryId)) {
                case 1: // Fragile
                    mainShape = document.querySelector('.main-shape-k5IpBb'); // Placeholder class for Fragile
                    qrPlaceholder = document.querySelector('.qr-placeholder-k5IpBb'); // Placeholder class for Fragile
                    titlePlaceholder = document.querySelector('.titel-placeholder-k5IpBb'); // Placeholder class for Fragile
                    break;
                case 2: // Hazard
                    mainShape = document.querySelector('.lable-shape-NBZXkN');  // Placeholder class for Hazard
                    qrPlaceholder = document.querySelector('.qr-placeholder-NBZXkN');  // Placeholder class for Hazard
                    titlePlaceholder = document.querySelector('.titel-placeholder-NBZXkN');  // Placeholder class for Hazard
                    break;
                case 3: // General
                    mainShape = document.querySelector('.main-shape-iv90TT');  // Placeholder class for General
                    qrPlaceholder = document.querySelector('.qr-placeholder-iv90TT');  // Placeholder class for General
                    titlePlaceholder = document.querySelector('.titel-placeholder-JAxmLZ');  // Placeholder class for General
                    break;
                default:
                    return null; // Invalid categoryId
            }

            if (!mainShape || !qrPlaceholder || !titlePlaceholder) {
                return null;
            }

            // Get bounding boxes for each element and find the overall bounding box
            const mainShapeBox = mainShape.getBoundingClientRect();
            const qrBox = qrPlaceholder.getBoundingClientRect();
            const titleBox = titlePlaceholder.getBoundingClientRect();

            // Calculate the bounding box that wraps all selected elements
            const x = Math.min(mainShapeBox.x, qrBox.x, titleBox.x);
            const y = Math.min(mainShapeBox.y, qrBox.y, titleBox.y);
            const width = Math.max(mainShapeBox.right, qrBox.right, titleBox.right) - x;
            const height = Math.max(mainShapeBox.bottom, qrBox.bottom, titleBox.bottom) - y;

            return { x, y, width, height };
        }, categoryId);  // Pass categoryId to the page.evaluate function


        if (!sectionsToCapture) {
            console.error('One or more elements were not found in DOM!');
            await browser.close();
            return res.status(500).send('Required elements were not found.');
        }

        // Capture screenshot and crop the image to the bounds of the required elements
        const imagePath = path.join(__dirname, `label-${labelId}.png`);
        await page.screenshot({
            path: imagePath,
            omitBackground: true,
            type: 'png',
            clip: {
                x: sectionsToCapture.x,
                y: sectionsToCapture.y,
                width: sectionsToCapture.width,
                height: sectionsToCapture.height
            }
        });

        await browser.close();

        // Apply rounded corners using a Canvas
        const roundedImagePath = path.join(__dirname, `label-rounded-${labelId}.png`);
        const canvas = createCanvas(sectionsToCapture.width * 5, sectionsToCapture.height * 5);
        const ctx = canvas.getContext('2d');

        // Load the screenshot into the canvas
        const image = await loadImage(imagePath);

        // Draw the image with rounded corners on the canvas
        const radius = 20 * 5;
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.arcTo(sectionsToCapture.width * 5, 0, sectionsToCapture.width * 5, sectionsToCapture.height * 5, radius);
        ctx.arcTo(sectionsToCapture.width * 5, sectionsToCapture.height * 5, 0, sectionsToCapture.height * 5, radius);
        ctx.arcTo(0, sectionsToCapture.height * 5, 0, 0, radius);
        ctx.arcTo(0, 0, sectionsToCapture.width * 5, 0, radius);
        ctx.closePath();
        ctx.clip();

        // Draw the image inside the clipped (rounded) area
        ctx.drawImage(image, 0, 0, sectionsToCapture.width * 5, sectionsToCapture.height * 5);

        // Save the rounded image to file
        const out = fs.createWriteStream(roundedImagePath);
        const stream = canvas.createPNGStream();
        stream.pipe(out);
        out.on('finish', () => {
            console.log('Rounded image saved successfully.');

            // Send the rounded image to the client
            res.download(roundedImagePath, `label-${labelId}.png`, (err) => {
                if (err) {
                    console.error('Error sending rounded image:', err);
                    return res.status(500).send('Error sending rounded image');
                }

                // Remove the original screenshot and rounded image after sending
                fs.unlink(imagePath, (err) => {
                    if (err) console.error('Error deleting original image file:', err);
                });
                fs.unlink(roundedImagePath, (err) => {
                    if (err) console.error('Error deleting rounded image file:', err);
                });
            });
        });

    } catch (error) {
        console.error('Error generating image:', error);
        res.status(500).send('Error generating image');
    }
});

// Function to generate a 6-digit pin
function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

router.get('/verify-pin', (req, res) => {
    console.log('--- [/verify-pin] Start of Function ---');
    
    const { labelId } = req.query;
    console.log('labelId received from query:', labelId);  // Log the received labelId

    if (!labelId) {
        return res.status(400).json({ success: false, message: 'Label ID is missing.' });
    }

    // Fetch the label information (including user_id and pin)
    db.query('SELECT user_id, pin FROM labels WHERE id = ?', [labelId], (err, results) => {
        if (err || results.length === 0) {
            console.error('Error retrieving label information:', err || 'No results found');
            return res.status(500).json({ success: false, message: 'Internal error or label not found.' });
        }

        const userId = results[0].user_id;
        let pin = results[0].pin;

        // If the pin is not generated yet, generate a new one
        if (!pin) {
            pin = generatePin();
            console.log('Generated PIN:', pin);

            // Update the label with the new PIN
            db.query('UPDATE labels SET pin = ? WHERE id = ?', [pin, labelId], (updateErr) => {
                if (updateErr) {
                    console.error('Error updating pin:', updateErr);
                    return res.status(500).json({ success: false, message: 'Internal error.' });
                }
            });
        }

        // Retrieve the user's email
        db.query('SELECT email FROM users WHERE id = ?', [userId], (emailErr, emailResults) => {
            if (emailErr || emailResults.length === 0) {
                console.error('Error retrieving user email:', emailErr);
                return res.status(500).json({ success: false, message: 'Internal error.' });
            }

            const userEmail = emailResults[0].email;

            // Send the PIN to the user's email
            sendPinEmail(userEmail, pin, (sendErr) => {
                if (sendErr) {
                    console.error('Error sending email:', sendErr);
                    return res.status(500).json({ success: false, message: 'Failed to send email.' });
                }

                // Render the verify page where the user enters the PIN
                res.render('verify-pin', { labelId, message: 'A PIN has been sent to your email.' });
            });
        });
    });
});

// POST route to verify the 6-digit PIN
router.post('/verify-pin', (req, res) => {
    console.log('--- [/verify-pin POST] Start of Function ---');
    const { labelId, digit1, digit2, digit3, digit4, digit5, digit6 } = req.body;

    // Combine the digits into a single PIN
    const pin = `${digit1}${digit2}${digit3}${digit4}${digit5}${digit6}`;

    // Retrieve the stored PIN and memo URL for the label
    db.query('SELECT pin, memo FROM labels WHERE id = ?', [labelId], (err, results) => {
        if (err || results.length === 0) {
            console.error('Error retrieving pin and memo:', err);
            return res.status(500).json({ success: false, message: 'Internal error.' });
        }

        const storedPin = results[0].pin;
        const memoUrl = results[0].memo;

        console.log('Stored PIN:', storedPin);
        console.log('Entered PIN:', pin);
        console.log('Memo URL:', memoUrl);

        // If the entered PIN matches the stored PIN
        if (storedPin === pin) {
            // Redirect the user to the memo URL
            res.redirect(memoUrl);
        } else {
            // Invalid PIN
            res.render('verify-pin', { labelId, message: 'Invalid PIN. Please try again.' });
        }
    });
});

// Export the router
module.exports = router;
