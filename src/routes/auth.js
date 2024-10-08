const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const db = require('../db/dbConnection');

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

// Route for the dashboard (after login)
router.get('/home', ensureAuthenticated, (req, res) => {
    const userId = req.session.userId; // Assume the user ID is stored in the session after login

    if (!userId) {
        return res.redirect('/login'); // Redirect to login if the user is not authenticated
    }

    // Call the stored procedure to get all boxes for the logged-in user
    db.query('CALL get_user_labels(?)', [userId], (err, results) => {
        if (err) {
            console.error('Error fetching user boxes:', err);
            return res.status(500).send('Server error');
        }

        // The results from a stored procedure call are in the first element of the array
        const userBoxes = results[0];
        console.log('Fetched labels:', userBoxes); // Debug: Check if QR data is present

        // Render the home page with the user's boxes
        res.render('home', { labels: userBoxes });
    });
});

// Route for the 'Add Label' page
router.get('/new-lable', ensureAuthenticated, (req, res) => {
    res.render('new-lable');  // Render the add label page only if authenticated
});
// Route for creating a new label
router.post('/new-lable', (req, res) => {
    // Assuming the label creation logic is in the authController
    authController.addLabel(req, res, (err) => {
        if (err) {
            console.error('Error creating label:', err);
            return res.status(500).send('Server error');
        }
        // Redirect to /home after the label is successfully created
        res.redirect('/home');
    });
});

// Route for the 'Create General Label' page
router.get('/general-lable', ensureAuthenticated, (req, res) => {
    res.render('general-lable', { query: req.query }); // Pass query parameters to the template
});

// Route for 'general-text' page
router.get('/general-text', ensureAuthenticated, (req, res) => {
    res.render('general-text', { query: req.query }); // Pass query parameters to the template
});

// Route for the voice page 
router.get('/general-voice', ensureAuthenticated, (req, res) => {
    res.render('general-voice', { query: req.query }); // Pass query parameters to the template
});
// Route for creating a new voice label
router.post('/general-voice', ensureAuthenticated, authController.addLabel);

// Route for the image page
router.get('/general-image', ensureAuthenticated, (req, res) => {
    res.render('general-image', { query: req.query }); // Pass query parameters to the template
});
// Route for creating a new image label
router.post('/general-image', ensureAuthenticated, authController.addLabel);

// Route for the 'General Complete' page
router.get('/general-complete', ensureAuthenticated, (req, res) => {
    console.log('--- [/general-complete] Start of Function ---');

    const labelId = req.query.labelId;
    console.log('[general-complete] Label ID:', labelId);

    if (!labelId) {
        console.error('[general-complete] Label ID is required.');
        return res.status(400).send('Label ID is required.');
    }

    const query = `
        SELECT labels.label_name, qr_codes.qr_code_data 
        FROM labels 
        LEFT JOIN qr_codes ON labels.id = qr_codes.label_id 
        WHERE labels.id = ?
    `;

    db.query(query, [labelId], (err, results) => {
        if (err) {
            console.error('[general-complete] Error fetching label data:', err);
            return res.status(500).send('Server error');
        }

        console.log('[general-complete] Query results:', results);

        if (!results || results.length === 0) {
            console.log('[general-complete] No label found with the specified ID.');
            return res.status(404).send('Label not found');
        }

        const labelData = {
            label_name: results[0].label_name,
            qr_data: results[0].qr_code_data
        };

        console.log('[general-complete] Label data being sent to template:', labelData);

        try {
            res.render('general-complete', { label: labelData });
        } catch (renderError) {
            console.error('[general-complete] Error rendering general-complete:', renderError);
            return res.status(500).send('Error rendering the page.');
        }
    });
});

// Route for handling label deletion within home
router.delete('/home', ensureAuthenticated, authController.deleteLabel);

// Route for the 'Create Hazard Label' page
router.get('/hazard-lable', ensureAuthenticated, (req, res) => {
    res.render('hazard-lable');  // Render the hazard label creation page
});

// Route for the 'Create Fragile Label' page
router.get('/fragile-lable', ensureAuthenticated, (req, res) => {
    res.render('fragile-lable');  // Render the fragile label creation page
});

router.get('/general-text', ensureAuthenticated, (req, res) => {
    res.render('general-text');  // Render the general label creation page
});

// route for the scan page
router.post('/scan-label', authController.scanLabel);

// Route for handling logout
router.get('/logout', authController.logout);


module.exports = router;
