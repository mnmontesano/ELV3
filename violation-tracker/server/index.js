const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const buildingsRouter = require('./routes/buildings');
const violationsRouter = require('./routes/violations');
const checksRouter = require('./routes/checks');
const categoriesRouter = require('./routes/categories');
const elv3Router = require('./routes/elv3');
const { startScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/buildings', buildingsRouter);
app.use('/api/violations', violationsRouter);
app.use('/api/checks', checksRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/elv3', elv3Router);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize database and start server
db.initialize();

app.listen(PORT, () => {
    console.log(`DOB Violation Tracker running on port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    
    // Start the violation check scheduler
    startScheduler();
});
