const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');

passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
  try {
    const user = await userModel.findByEmail(email.toLowerCase().trim());
    if (!user) return done(null, false, { message: 'Invalid email or password.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return done(null, false, { message: 'Invalid email or password.' });
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    done(null, await userModel.findById(id));
  } catch (error) {
    done(error);
  }
});
