/* jshint esnext: true */
var config;
if (process.env.NODE_ENV === 'dev') {
    config = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-user-q/config/dev/config.js');
} else {
    config = require('/usr/src/app/config/prod/config.js');
}
var nodemailer = require('nodemailer');


/**
 * Setup the nodemailer
 * create reusable transporter object using the default SMTP transport
 * 
 */
let transporter = nodemailer.createTransport({
    host: process.env.USER_Q_SERVICE_EMAIL_HOST || config.email.host,
    port: process.env.USER_Q_SERVICE_EMAIL_PORT || config.email.port,
    secure: process.env.USER_Q_SERVICE_EMAIL_SECURE || config.email.secure,
    auth: {
        user: process.env.USER_Q_SERVICE_EMAIL_USER || config.email.auth.user,
        pass: process.env.USER_Q_SERVICE_EMAIL_PASSWORD || config.email.auth.pass
    }
});


/*
 * Sends email containing generated error
 * 
 */
module.exports.sendApiUserQErrorEmail = function (error) {
  var mailOptions = {
      from: '"Chatster" <mwsoft01@mwsoft.nl>', // sender address
      to: 'n.karpovas@yahoo.com', // list of receivers
      subject: 'Chatster Api User Q Error', // Subject line
      text: `Chatster User Q Error`, // plain text body
      html: `<p>The following error has been generated:</p> <p>${error}</p>` // html body
  };
  // send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
          // console.log(error);
      }
  });
}


/*
 * Sends an email to notify of successfull startup of this service
 * 
 */
module.exports.sendNewApiUserQIsUpEmail = function () {
  var mailOptions = {
      from: '"Chatster" <mwsoft01@mwsoft.nl>', // sender address
      to: 'n.karpovas@yahoo.com', // list of receivers
      subject: 'Chatster New Api User Q Server Is Up', // Subject line
      text: `Chatster New Api User Q Server Is Up`
  };
  // send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
          // console.log(error);
      }
  });
}