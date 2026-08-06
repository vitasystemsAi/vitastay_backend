const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const xss = require('xss-clean');
const config = require('./config');
const logger = require('./config/logger');
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const hostelRoutes = require('./routes/hostelRoutes');
const roomRoutes = require('./routes/roomRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const rentRoutes = require('./routes/rentRoutes');
const revenueRoutes = require('./routes/revenueRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const noticeRoutes = require('./routes/noticeRoutes');
const staffRoutes = require('./routes/staffRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const reportRoutes = require('./routes/reportRoutes');
const bedRoutes = require('./routes/bedRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));
app.use(compression());
app.use(xss());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Vita Stay API is running', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/hostels', hostelRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/rent', rentRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/beds', bedRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/super-admin', superAdminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
