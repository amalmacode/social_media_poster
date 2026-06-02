const crypto = require('crypto');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const userModel = require('../models/userModel');
const AppError = require('../utils/AppError');

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required()
});

async function register(input) {
  const { value, error } = registerSchema.validate(input, { stripUnknown: true });
  if (error) throw new AppError(error.message, 400);
  const email = value.email.toLowerCase().trim();
  if (await userModel.findByEmail(email)) throw new AppError('Email is already registered.', 409);
  const passwordHash = await bcrypt.hash(value.password, 12);
  return userModel.create({ email, passwordHash });
}

function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { register, createResetToken };
