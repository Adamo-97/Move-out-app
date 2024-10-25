const express = require('express');
const passport = require('passport');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config/config.json');
require('./src/helpers/passport');
const os = require('os');

// Create an Express app
const app = express();
// Import routes
const authRoutes = require('./src/routes/auth');

// Middleware to parse JSON and URL-encoded data
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

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

// Serve static files (like JavaScript) from the 'src' folder
app.use('/src', express.static(path.join(__dirname, 'src')));

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
    secret: process.env.SESSION_SECRET || config.session.secret, // Use environment variable for session secret
    resave: config.session.resave,
    saveUninitialized: config.session.saveUninitialized,
    cookie: { secure: process.env.NODE_ENV === 'production' } // Secure cookies in production
}));

// Initialize Passport.js and use session
app.use(passport.initialize());
app.use(passport.session());

// Use routes from the `authRoutes`
app.use('/', authRoutes);

// Start the server on the port 
// Helper function to get the local network IP address
function getLocalNetworkIP() {
    const interfaces = os.networkInterfaces();
    for (const iface in interfaces) {
      for (const details of interfaces[iface]) {
        // Check if the IP address is IPv4 and not internal (i.e., not localhost)
        //helps to get the local network IP address if youre planning to use port forwarding
        if (details.family === 'IPv4' && !details.internal) {
          return details.address;
        }
      }
    }
    return 'IP not found';
  }
  
  app.listen(3000, '0.0.0.0', () => {
    const localIP = getLocalNetworkIP();
    console.log(`Server running on port 3000`);
    console.log(`Access it via localhost: http://localhost:3000`);
    console.log(`Access it via network: http://${localIP}:3000`);
  });