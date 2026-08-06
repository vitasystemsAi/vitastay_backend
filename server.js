require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const logger = require('./config/logger');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, 'uploads');
const logsDir = path.join(__dirname, 'logs');
[uploadsDir, logsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const startServer = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established');

    if (config.nodeEnv === 'development') {
      await sequelize.sync({ alter: false });
      logger.info('Database synced');
    }

    app.listen(config.port, () => {
      logger.info(`Vita Stay API server running on port ${config.port} [${config.nodeEnv}]`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
