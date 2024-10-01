const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config/config.json'); // Load session and DB config

// Create an Express app
const app = express();

// Middleware to parse JSON and URL-encoded data
app.use(express.json()); // Place this after initializing 'app'
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded bodies

// Configure body-parser to handle form submissions
app.use(bodyParser.urlencoded({ extended: false }));

// Set the view engine to EJS for rendering templates
app.set('view engine', 'ejs');

// Serve static files (like CSS) from the 'public' folder
app.use(express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.svg')) {
            res.set('Content-Type', 'image/svg+xml');
        }
    }
}));

// Cache-control middleware to prevent pages from being cached
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

// Set up session management using settings from config.json
app.use(session({
    secret: config.session.secret,              // Secret key for signing sessions
    resave: config.session.resave,              // Whether to save session when unchanged
    saveUninitialized: config.session.saveUninitialized,  // Save new sessions that are not initialized
    cookie: { secure: false }  // Use false for local development
}));

// Import routes
const authRoutes = require('./src/routes/auth');

// Use routes from the `authRoutes`
app.use('/', authRoutes);

// Start the server on port 3000
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
