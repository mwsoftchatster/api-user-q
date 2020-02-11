/*
  Copyright (C) 2017 - 2020 MWSOFT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
/* jshint esnext: true */
var config;
var email;
if (process.env.NODE_ENV === 'dev') {
    config = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-user-q/config/dev/config.js');
    email = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-user-q/lib/email_lib.js');
} else {
    config = require('/usr/src/app/config/prod/config.js');
    email = require('/usr/src/app/lib/email_lib.js');
}


/**
 *  Setup the pool of connections to the db so that every connection can be reused upon it's release
 *
 */
var mysql = require('mysql');
var Sequelize = require('sequelize');
const sequelize = new Sequelize(
    process.env.USER_Q_SERVICE_DB || config.db.name,
    process.env.USER_Q_SERVICE_DB_USER || config.db.user_name, 
    process.env.USER_Q_SERVICE_DB_PASSWORD || config.db.password, {
        host: process.env.USER_Q_SERVICE_DB_HOST || config.db.host,
        dialect: process.env.USER_Q_SERVICE_DB_DIALECT || config.db.dialect,
        port: process.env.USER_Q_SERVICE_DB_PORT || config.db.port,
        operatorsAliases: process.env.USER_Q_SERVICE_DB_OPERATORS_ALIASES || config.db.operatorsAliases,
        pool: {
            max: process.env.USER_Q_SERVICE_DB_POOL_MAX || config.db.pool.max,
            min: process.env.USER_Q_SERVICE_DB_POOL_MIN || config.db.pool.min,
            acquire: process.env.USER_Q_SERVICE_DB_ACQUIRE || config.db.pool.acquire,
            idle: process.env.USER_Q_SERVICE_DB_IDLE || config.db.pool.idle
        }
    }
);


/**
 *  Publishes message on api-user-c topic
 */
function publishOnUserC(amqpConn, message, topic) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'apiUserC.*';
            var toipcName = `apiUserC.${topic}`;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, toipcName, Buffer.from(message));
        });
    }else {
        // log and send error
        email.sendApiUserQErrorEmail("API Usert Q AMPQ connection was empty");
    }
}


/**
 *  Creates new user
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.createUser = function (user, amqpConn) {
    sequelize.query('CALL SaveNewUser(?,?,?,?,?,?,?,?)',
    { replacements: [ user.userId, user.userName, user.profilePic, user.statusMessage, user.userProfileCreated, user.userProfileLastUpdated, user.contactIds, user.dateCreated ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                var response = {
                    status: config.rabbitmq.statuses.ok,
                    userId: user.userId
                };
                publishOnUserC(amqpConn, JSON.stringify(response), config.rabbitmq.topics.newUserProcessedQ);
    }).error(function(err){
        email.sendApiUserQErrorEmail(err);
        var response = {
            status: config.rabbitmq.statuses.error,
            userId: user.userId
        };
        publishOnUserC(amqpConn, JSON.stringify(response), config.rabbitmq.topics.newUserProcessedQ);
    });
};


/**
 *  Checks if user name is available
 *
 * (userName String): name to be checked fot availability
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.checkIfUserNameIsAvailable = function (userName, socket){
    sequelize.query('CALL GetUserByName(?)',
    { replacements: [ userName ],
         type: sequelize.QueryTypes.RAW }).then(result => {
            if(result.length > 0){
                socket.emit("checkUserNameAvailability", "unavailable");
            }else{
                socket.emit("checkUserNameAvailability", "available");
            } 
    }).error(function(err){
        email.sendApiUserQErrorEmail(err);
        socket.emit("checkUserNameAvailability", "error");
    });
};


/**
 *  Updates user profile picture url and status message
 *
 * (userId String): id of the user who's data is to be updated
 * (amqpConn Object): RabbitMQ connection object that is used to send api-user-c response
 */
module.exports.updateStatusAndProfilePic = function (message, amqpConn){
    // update statusMessage and profile pic for user with id
    sequelize.query('CALL UpdateUserStatusAndProfilePicture(?,?,?)',
        { replacements: [ message.userId, message.statusMessage, message.profilePicUrl ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                // send success message via mq
                var response = {
                    status: config.rabbitmq.statuses.ok,
                    userId: message.userId
                };
                publishOnUserC(amqpConn, JSON.stringify(response), config.rabbitmq.topics.userUpdateProfileQ);
    }).error(function(err){
        email.sendApiUserQErrorEmail(err);
        // send error message via mq
        var response = {
            status: config.rabbitmq.statuses.error,
            userId: message.userId
        };
        publishOnUserC(amqpConn, JSON.stringify(response), config.rabbitmq.topics.userUpdateProfileQ);
    });
};


/**
 *  Updates user is allowed to unsend
 *
 * (userId int): id of the user of who is allowing their contact to unsend messages
 * (contactId int): id of the contact to whom the user is allowing to unsend messages
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.updateUserIsAllowedToUnsend = function (message, amqpConn){
    sequelize.query('CALL UpdateContactIsAllowedToUnsend(?,?)',
    { replacements: [ message.userId, message.contactId ],
         type: sequelize.QueryTypes.RAW }).then(result => {
            // send success message via mq
            var response = {
                status: config.rabbitmq.statuses.ok,
                userId: message.userId
            };
            publishOnUserC(amqpConn, JSON.stringify(response), config.rabbitmq.topics.userAllowUnsendQ);
    }).error(function(err){
        email.sendApiUserQErrorEmail(err);
        // send error message via mq
        var response = {
            status: config.rabbitmq.statuses.error,
            userId: message.userId
        };
        publishOnUserC(amqpConn, JSON.stringify(response), config.rabbitmq.topics.userAllowUnsendQ);
    });
};


/**
 *  Updates user is not allowed to unsend
 *
 * (userId int): id of the user of who is not allowing their contact to unsend messages
 * (contactId int): id of the contact to whom the user is not allowing to unsend messages
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.updateUserIsNotAllowedToUnsend = function (message, amqpConn){
    sequelize.query('CALL UpdateContactIsNotAllowedToUnsend(?,?)',
    { replacements: [ message.userId, message.contactId ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             // send success message via mq
             var response = {
                status: config.rabbitmq.statuses.ok,
                userId: message.userId
            };
            publishOnUserC(amqpConn, JSON.stringify(response), config.rabbitmq.topics.userDisAllowUnsendQ);
    }).error(function(err){
        email.sendApiUserQErrorEmail(err);
        // send error message via mq
        var response = {
            status: config.rabbitmq.statuses.error,
            userId: message.userId
        };
        publishOnUserC(amqpConn, JSON.stringify(response), config.rabbitmq.topics.userDisAllowUnsendQ);
    });
};


/**
 *  Retrieves the latest contacts information
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.getContactLatest = function (req, res){
    var latestContacts = [];
    if(req.query.contacts !== null && req.query.contacts !== undefined){
        sequelize.query('CALL GetUsersWithIdIn(?)',
        { replacements: [ req.query.contacts.toString() ],
             type: sequelize.QueryTypes.RAW }).then(result => {
                 if(result.length > 0){
                    for (var i = 0; i < result.length; i++) {
                        var latestContact = {
                            _id: result[i].user_id,
                            name: result[i].user_name,
                            statusMessage: result[i].user_status_message,
                            profilePic: result[i].user_profile_pic
                        };
                        latestContacts.push(latestContact);
                    }
                    res.json(latestContacts);
                }else{
                    res.json(latestContacts);
                }
        }).error(function(err){
            email.sendApiUserQErrorEmail(err);
            res.json(latestContacts);
        });
    }else{
        res.json(latestContacts); 
    }
};


/**
 *  Verifies users phone number
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.verifyPhone = function (req,res){
    sequelize.query('CALL GetUserById(?)',
    { replacements: [ req.query.phoneToVerify.toString() ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             if(result.length > 0){
                var existingUserName = result[0].user_name;
                var existingUserStatusMessage = result[0].user_status_message;
                var existingUserProfilePic = result[0].user_profile_pic;
                var chatsterContacts = [];
                sequelize.query('CALL GetUsersWithIdIn(?)',
                { replacements: [ req.query.contacts.toString() ],
                     type: sequelize.QueryTypes.RAW }).then(result => {
                         if(result.length > 0){
                            for (var i = 0; i < result.length; i++) {
                                chatsterContacts.push(parseInt(result[i].user_id));
                            }
                        }
                        var confirmPhoneResponse = {
                            _id: parseInt(req.query.phoneToVerify),
                            name: existingUserName,
                            profilePic: existingUserProfilePic,
                            statusMessage: existingUserStatusMessage,
                            chatsterContacts: chatsterContacts,
                            userAlreadyExists: true,
                            status: "success"
                        };
                        // send the response object in json
                        res.json(confirmPhoneResponse);
                }).error(function(err){
                    email.sendApiUserQErrorEmail(err);
                    res.json(null);
                });
            }else{
                // user does not exist yet
                var confirmPhoneResponse = {
                    _id: parseInt(req.query.phoneToVerify),
                    name: "none",
                    profilePic: "none",
                    statusMessage: "none",
                    chatsterContacts: [0],
                    userAlreadyExists: false,
                    status: "success"
                };
                // send the response object in json
                res.json(confirmPhoneResponse);
            }
    }).error(function(err){
        email.sendApiUserQErrorEmail(err);
        res.json(null);
    });
};