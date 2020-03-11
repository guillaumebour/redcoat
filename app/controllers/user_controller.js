require('rootpath')();
var logger = require('config/winston');

var BASE_URL = require('config/base_url').base_url;
var User = require('../models/user');
var passport = require('passport');

var crypto = require('crypto');

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);



// The registration page.
exports.registerPage = function(req, res) {
  res.render('users/register', { title: "Register", formData: {} });
}

// The register action.
exports.register = function(req, res, next) {
    logger.info('Registering user "' + req.body.username + '".');
    User.register(new User({username: req.body.username, email: req.body.email}), req.body.password, function(err, user) {
      if (err) {
        var msg = err.message
        if(msg[msg.length-1] != ".")
          msg += ".";
        res.render('users/register', {
          formData: {
            username: req.body.username,
            email: req.body.email,
            password: req.body.password,
            password_confirmation: req.body.password_confirmation
          },
          message: msg,
        });
        return;
      }
      passport.authenticate('local')(req,res, function() {
        res.redirect(BASE_URL + 'projects');
      });      
    });
  }

// The login page.
exports.loginPage = function(req, res) {
  if(req.user)
    res.redirect(BASE_URL + 'projects');
  res.render('users/login', {formData: {}, title: "Login"});
}

// The login action.
exports.login = function(req, res, next) {
  passport.authenticate('local', function(err, user, info) {
    if(err) return next(err);
    if(!user) { 
      var msg = info.message;
      return res.render('users/login', {
        formData: {
          username: req.body.username,
          password: req.body.password,
        },
        message: msg,
      });
    }
    req.logIn(user, function(err) {
      return res.redirect(BASE_URL + 'projects');
    });     
    
  })(req, res, next); 
   
}

// The logout action.
exports.logout = function(req, res) {
  req.logout();
  res.redirect(BASE_URL);
}

module.exports.user_profile = function(req, res) {
  res.render('users/profile', {title: "Your Profile"} )
}

exports.forgot_password = function(req, res) { 
  return res.render('users/forgot_password', {
    formData: {
      password: req.body.email,
    },
    title: "Forgot password"
  });
}

exports.forgot_password_submit = function(req, res, next) {
  User.findOne({ email: req.body.email }, function(err, user) {
    console.log('u', err, user)
    if(user == null) {
      msg = "No user with that email address exists.";
      return res.render('users/forgot_password', {
        formData: {
          email: req.body.email,
        },
        message: msg,
        title: "Forgot password",
      });
    }

    console.log(process.env.SENDGRID_API_KEY)
    crypto.randomBytes(20, function(err, buf) {
      var token = buf.toString('hex');
      const msg = {
        to: req.body.email,
        from: 'Redcoat@nlp-tools.org',
        fromname: "Redcoat - Collaborative Annotation Tool",
        subject: 'Password reset',
        text: 'You are receiving this email because you (or someone else) has requested your Redcoat password to be reset.\n\n' +
        'To reset your password, please click on the following link, or paste it into your browser:\n\n' +
        'http://' + req.headers.host + BASE_URL + 'reset_password/' + token +'\n\n' +
        'If you did not request your password to be reset, please ignore this email and your password will remain unchanged. The link above will expire after 1 hour.',
      };

      user.resetPasswordToken = token;
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

      //passport.authenticate('local')(req,res, function() {
        user.save(function(err) {
          console.log(err);
          sgMail.send(msg, function(err, result) {
            if(err) return next(err);
            return res.render('users/forgot_password', {
              email_sent: req.body.email,
              title: "Forgot password"
            });
          });
        });
      //});
    });

    





  });
}

exports.reset_password = function(req, res) {
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
    if(!user) {
      return res.render('users/forgot_password', {
        message: "Password reset link is invalid or has expired.",
        formData: {}
      });
    }
    res.render('users/reset_password', {
      //user: req.user,
      token: req.params.token,
      formData: {}
    });
  });
}

exports.reset_password_submit = function(req, res, next) {
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
    if(!user) {
      return res.render('users/forgot_password', {
        message: "Password reset link is invalid or has expired.",
        title: "Error",
        formData: {}
      });
    }

    const msg = {
      to: user.email,
      from: 'Redcoat@nlp-tools.org',
      fromname: "Redcoat - Collaborative Annotation Tool",
      subject: 'Your password has been reset',
      text: 'This is an email to confirm that your Redcoat password has been changed.',
    };

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.setPassword(req.body.password, function(err) {
      if(err) return next(err);
      user.save(function(err) {
        if(err) return next(err);
        sgMail.send(msg, function(err, result) {
          if(err) { logger.error(err.stack); }
          return res.render('users/reset_password', {
            password_is_reset: true,
            title: "Your password has been reset"
          });
        });
      });
    })
  });
}
