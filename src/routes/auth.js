const express = require('express');
const passport = require('passport');
const router = express.Router();
const authController = require('../controllers/authController');
const db = require('../db/dbConnection');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

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
            res.render('home', { labels: userBoxes, userName });
        });
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

// Route to handle QR code scanning
router.get('/scan-label', (req, res) => {
    console.log('--- [/scan-label] Start of Function ---');
    const { labelId } = req.query;

    // Retrieve label information from the database
    db.query('SELECT public, memo FROM labels WHERE label_id = ?', [labelId], (err, results) => {
        if (err || results.length === 0) {
            console.error('Error retrieving label information:', err);
            return res.status(500).send('Internal error.');
        }

        const isPublic = results[0].public;
        const memoUrl = results[0].memo;

        // Check if the label is public
        if (isPublic) {
            // If public, redirect directly to the memo
            return res.redirect(memoUrl);
        } else {
            // If private, redirect to the PIN verification page
            res.redirect(`/verify-pin?labelId=${labelId}`);
        }
    });
});

// Route for PIN verification page
router.get('/verify-pin', ensureAuthenticated, (req, res) => {
    res.render('verify-pin', { labelId: req.query.labelId, message: null });
});
// POST route to verify the 6-digit PIN
router.post('/verify-pin', (req, res) => {
    const { labelId, digit1, digit2, digit3, digit4, digit5, digit6 } = req.body;

    // Combine the digits into a single PIN
    const pin = `${digit1}${digit2}${digit3}${digit4}${digit5}${digit6}`;

    // Call the controller logic to verify the PIN
    authController.verifyPin(req, res, pin);
});
// Route to access the memo after PIN verification
router.get('/access-memo', ensureAuthenticated, (req, res) => {
    authController.accessMemo(req, res);
});

// Route for the admin page
router.get('/admin', (req, res) => {
    res.render('admin');
});
// Export the router
module.exports = router;
