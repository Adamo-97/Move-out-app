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

// Route for handling label deletion within home
router.delete('/home', ensureAuthenticated, authController.deleteLabel);

// Route for handling logout
router.get('/logout', authController.logout);

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

// Generalized route for 'Complete' page (handles general, fragile, hazard)
router.get('/label-complete', ensureAuthenticated, (req, res) => {
    console.log('--- [/label-complete] Start of Function ---');

    const labelId = req.query.labelId;
    const categoryId = req.query.category_id; // Extract the category_id from the query

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
            qr_data: results[0].qr_code_data
        };

        console.log('[label-complete] Label data being sent to template:', labelData);

        // Determine the label type based on the categoryId and render the correct template
        let template = '';
        switch (parseInt(categoryId)) {
            case 1:
                template = 'fragile-comple';
                break;
            case 2:
                template = 'hazard-complete';
                break;
            case 3:
                template = 'general-complete';
                break;
            default:
                console.error('[label-complete] Invalid Category ID.');
                return res.status(400).send('Invalid Category ID.');
        }

        try {
            res.render(template, { label: labelData });
        } catch (renderError) {
            console.error(`[label-complete] Error rendering ${template}:`, renderError);
            return res.status(500).send('Error rendering the page.');
        }
    });
});

// Export the router
module.exports = router;
