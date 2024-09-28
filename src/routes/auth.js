const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

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

// Middleware to protect routes
const ensureAuthenticated = (req, res, next) => {
    if (req.session.isAuthenticated) {
        return next();  // Proceed if the user is authenticated
    }
    res.redirect('/login');  // Redirect to login if not authenticated
};

// Route for the dashboard (after login)
router.get('/home', ensureAuthenticated, (req, res) => {
    res.render('home');  // Render the home page only if authenticated
});

// Route for the 'Add Label' page
router.get('/new-lable', ensureAuthenticated, (req, res) => {
    res.render('new-lable');  // Render the add label page only if authenticated
});

// Route for the 'Create General Label' page
router.get('/general-lable', ensureAuthenticated, (req, res) => {
    res.render('general-lable');  // Render the general label creation page
});

// Route for the 'Create Hazard Label' page
router.get('/hazard-lable', ensureAuthenticated, (req, res) => {
    res.render('hazard-lable');  // Render the hazard label creation page
});

// Route for the 'Create Fragile Label' page
router.get('/fragile-lable', ensureAuthenticated, (req, res) => {
    res.render('fragile-lable');  // Render the fragile label creation page
});



// Route for handling logout
router.get('/logout', authController.logout);

// Add a new label
router.post('/new-lable', authController.addLabel);

// Generate a QR code
router.post('/generate-qr', authController.generateQRCode);

// Archive a label
router.post('/archive-label', authController.archiveLabel);

// Edit a label
router.post('/edit-label', authController.editLabel);



module.exports = router;
