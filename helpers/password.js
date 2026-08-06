const bcrypt = require('bcrypt');
const config = require('../config');

const hashPassword = async (password) => {
  return bcrypt.hash(password, config.bcryptRounds);
};

const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

module.exports = { hashPassword, comparePassword };
