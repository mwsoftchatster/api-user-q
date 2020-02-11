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
require('events').EventEmitter.prototype._maxListeners = 0;

var config;
var email;
var functions;
if (process.env.NODE_ENV === 'dev') {
    config = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-user-q/config/dev/config.js');
    email = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-user-q/lib/email_lib.js');
    functions = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-user-q/lib/func_lib.js');
} else {
    config = require('/usr/src/app/config/prod/config.js');
    email = require('/usr/src/app/lib/email_lib.js');
    functions = require('/usr/src/app/lib/func_lib.js');
}

var fs = require("fs");
var express = require("express");
var https = require('https');
var amqp = require('amqplib/callback_api');
var options = {
    key: fs.readFileSync(config.security.key),
    cert: fs.readFileSync(config.security.cert)
};
var app = express();
var bodyParser = require("body-parser");
var cors = require("cors");
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.raw({ limit: '50mb' }));
app.use(bodyParser.text({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: false }));
app.use(express.static("./public"));
app.use(cors());

app.use(function(req, res, next) {
    next();
});

var server = https.createServer(options, app).listen(process.env.USER_Q_SERVICE_PORT || config.port.user_q_port, function() {
    email.sendNewApiUserQIsUpEmail();
});


/**
 *   RabbitMQ connection object
 */
var amqpConn = null;

/**
 *  Subscribe api-user-q to topic to receive messages
 */
function subscribeToUserQ(topic) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'apiUserQ.*';
            var toipcName = `apiUserQ.${topic}`;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.assertQueue(toipcName, { exclusive: false, auto_delete: true }, function(err, q) {
                ch.bindQueue(q.queue, exchange, toipcName);
                ch.consume(q.queue, function(msg) {
                    var message = JSON.parse(msg.content.toString());
                    if (toipcName === `apiUserQ.${config.rabbitmq.topics.newUser}`){
                        functions.createUser(message, amqpConn);
                    } else if (toipcName === `apiUserQ.${config.rabbitmq.topics.userUpdateProfile}`){
                        functions.updateStatusAndProfilePic(message, amqpConn);
                    } else if (toipcName === `apiUserQ.${config.rabbitmq.topics.userAllowUnsend}`){
                        functions.updateUserIsAllowedToUnsend(message, amqpConn);
                    } else if (toipcName === `apiUserQ.${config.rabbitmq.topics.userDisAllowUnsend}`){
                        functions.updateUserIsNotAllowedToUnsend(message, amqpConn);
                    }
                }, { noAck: true });
            });
        });
    }
}


/**
 *  Connect to RabbitMQ
 */
function connectToRabbitMQ() {
    amqp.connect(process.env.USER_Q_SERVICE_RABBIT_MQ_URL || config.rabbitmq.url, function(err, conn) {
        if (err) {
            console.error("[AMQP]", err.message);
            return setTimeout(connectToRabbitMQ, 1000);
        }
        conn.on("error", function(err) {
            if (err.message !== "Connection closing") {
                console.error("[AMQP] conn error", err.message);
            }
        });
        conn.on("close", function() {
            console.error("[AMQP] reconnecting");
            return setTimeout(connectToRabbitMQ, 1000);
        });
        console.log("[AMQP] connected");
        amqpConn = conn;

        // Subscribe to topics
        subscribeToUserQ(config.rabbitmq.topics.newUser);
        subscribeToUserQ(config.rabbitmq.topics.userUpdateProfile);
        subscribeToUserQ(config.rabbitmq.topics.userAllowUnsend);
        subscribeToUserQ(config.rabbitmq.topics.userDisAllowUnsend);
    });
}

connectToRabbitMQ();


/**
 *  SOCKET.IO listeners
 */
var io = require("socket.io")(server, { transports: ['websocket'] });
io.sockets.on("connection", function(socket) {
    /**
     * on.checkUserNameAvailability checks if user name is available
     */
    socket.on("checkUserNameAvailability", function(userName) {
        functions.checkIfUserNameIsAvailable(userName, socket);
    });
    
    /**
     * on.disconnect listens for disconnect events
     */
    socket.on("disconnect", function() {});
}); 


/**
 *  GET contactLatest request
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.get("/contactLatest", function(req, res) {
    functions.getContactLatest(req, res);
});


/**
 *  POST verify phone number for the user with phone number
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/verifyPhone", function(req, res) {
    functions.verifyPhone(req, res);
});