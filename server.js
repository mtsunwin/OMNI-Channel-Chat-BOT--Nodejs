const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session')
const request = require('request');
const fs = require('fs');
const configAuth = require('./config');
const app = express().use(bodyParser.json());

// Session
app.set('trust proxy', 1) // trust first proxy
app.use(session({secret: 'SCC-Thangtm13'}));
// Session END

const callRocket = require('./webhook-rocket/createWebhook');
const api = require('./webhook-rocket/apiRest');

// Start Server
app.listen(process.env.PORT || 1337, () => console.log('webhook is listening'));
// app.listen(4001, () => console.log('webhook is listening'));
// Start Server END

// Passport FB
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
app.use(bodyParser.urlencoded({extended: true}));
app.use(passport.initialize());
app.use(passport.session());
// xác định đăng nhập từ FB
app.get('/auth/facebook', passport.authenticate('facebook'));
// Xử lý dữ liệu callback về
app.get('/auth/facebook/callback', passport.authenticate('facebook',
    {failureRedirect: '/auth/facebook', successRedirect: '/'})
);
app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});
passport.use(new FacebookStrategy(configAuth.facebookAuth,
    function (accessToken, refreshToken, profile, done) {
        process.nextTick(function () {
            // Lấy được token khi User thực hiện đăng nhập
            // Thực hiện login vào Rocket.Chat
            api.loginWithFacebook(accessToken, (data) => {
                if (data.status == "success") {
                    done(null, accessToken);
                }
            });
        });
    }
));
passport.serializeUser((user, done) => {
    done(null, user);
});
passport.deserializeUser((_name, done) => {
    done(null, _name);
})
// Passport FB END

app.get("/", function (req, resp) {
    fs.readFile('index.html', (err, data) => {
        resp.end(data);
    });
});

// Creates the endpoint for our webhook
app.post('/webhook', (req, res) => {

    console.log("session", req.session.passport.user);

    let body = req.body;
    console.log("Nhập request từ Facebook");
    console.log("Với giá trị:", body.entry[0].changes);
    // Checks this is an event from a page subscription
    if (body.object === 'page') {
        // Iterates over each entry - there may be multiple if batched
        body.entry.forEach(function (entry) {
            if (!entry.messaging) {
                return;
            }
            // Gets the message. entry.messaging is an array, but
            // will only ever contain one message, so we get index 0
            let pageEntry = entry.messaging;
            pageEntry.forEach((messagingEvent) => {
                let sender_psid = messagingEvent.sender.id;
                if (messagingEvent.message) {

                    handleMessage(sender_psid, messagingEvent.message);

                } else if (messagingEvent.account_linking) { // eslint-disable-line camelcase, max-len

                    console.log("chưa biết chuyện gì xãy ra");

                }
                if (messagingEvent.postback) {

                    console.log("postback");
                    handlePostback(sender_psid, messagingEvent.postback);

                } else {
                    console.error(
                        'Webhook received unknown messagingEvent: ',
                        messagingEvent
                    );
                }
            });
        });
        // Returns a '200 OK' response to all requests
        res.status(200).send('EVENT_RECEIVED');
    } else {
        // Returns a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }
});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {
    // Your verify token. Should be a random string.
    let VERIFY_TOKEN = "thang_dep_trai"
    // Parse the query params
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];
    // Checks if a token and mode is in the query string of the request
    if (mode && token) {
        console.log("call this");
        // Checks the mode and token sent is correct
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            // Responds with the challenge token from the request
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            res.sendStatus(403);
        }
    }
});

// Handles messages events
/**
 * Gửi tin nhắn
 * @param sender_psid id-user gửi tin nhắn
 * @param received_message nội dung tin nhắn
 */
function handleMessage(sender_psid, received_message) {
    let response;
    // Check if the message contains text
    if (received_message.text) {
        // Create the payload for a basic text message
        switch ((received_message.text).toLowerCase()) {
            case 'bắt đầu':
                response = {
                    "attachment": {
                        "type": "template",
                        "payload": {
                            "template_type": "generic",
                            "elements": [{
                                "title": "Đăng nhập để trò chuyện cùng chúng tôi",
                                "subtitle": "Tài khoản FB của bạn sẽ liên kết đến ứng dụng của chúng tôi...",
                                "buttons": [
                                    {
                                        "type": "account_link",
                                        "url": "https://ten-lua-webhook.herokuapp.com/auth/facebook"
                                    }
                                ],
                            }]
                        }
                    }
                }
                break;
            default:
                response = {
                    "text": "Thử sử dụng cú pháp 'Bắt Đầu' để đăng nhập"
                }
        }
    }

    // Sends the response message
    callSendAPI(sender_psid, response);
    // sendMsgToRocket(sender_psid, received_message.text)
}

// Handles messaging_postbacks events
function handlePostback(sender_psid, received_postback) {
    console.log("post_back", sender_psid);
    console.log("received_postback", received_postback);
}

// Sends response messages via the Send API
function callSendAPI(sender_psid, response) {
// Construct the message body
    let request_body = {
        "recipient": {
            "id": sender_psid
        },
        "message": response
    }
    // Send the HTTP request to the Messenger Platform
    request({
        "uri": "https://graph.facebook.com/v2.6/me/messages",
        "qs": {"access_token": 'EAAG9mksIwrUBAGI7pm0p4X7rAS25WJNZBDCGS3XdnPX6Bsf0whRmnT2OdHZCFTZCgK7lAcJi8ZBn8hZC1WKxhTTS5VZBsSEZCamCMKje7ZCiPokxuhDEgbiFEXPlukU9rRm3uE0JzEO2oyxCcWpDIvZCYR4ATW6YZAkdZABQi7wUTtQVgZDZD'},
        "method": "POST",
        "json": request_body
    }, (err, res, body) => {
        if (!err) {
            console.log('message sent!')
        } else {
            console.error("Unable to send message:" + err);
        }
    });
}

app.get('/login', (req, res) => {
    const accountLinkingToken = req.query.account_linking_token;
    const redirectURI = req.query.redirect_uri;
    console.log("token", accountLinkingToken);
    api.loginWithFacebook(accountLinkingToken);
    res.end();
});

function sendMsgToRocket(_id, _msg) {
    let request_body = {
        "text": _msg,
        "userId": _id
    }
    request({
        "uri": "https://ten-lua.herokuapp.com/hooks/G9HvcSvqrkBcAmgz9/HXp6YNwzcD273PuCBk7PhnXgn3b33gFBjoS77rWztTyp7kPb",
        "qs": {"access_token": 'G9HvcSvqrkBcAmgz9/HXp6YNwzcD273PuCBk7PhnXgn3b33gFBjoS77rWztTyp7kPb'},
        "method": "POST",
        "json": request_body
    }, (err, res, body) => {
        if (!err) {
            console.log('message sent!')
        } else {
            console.error("Unable to send message:" + err);
        }
    });
}

// Creates the endpoint for our webhook
app.post('/ten-lua', (req, res) => {
    let body = req.body;
    // body.token: 'QFJB7u78GHwLD2P37vwdaeRC',
    // body.bot: false,
    // body.channel_id: 'K5T7c6MJaGLcYiYpf',
    // body.channel_name: 'facebook_msg',
    // body.message_id: 'xyPKWqnmxWG84sPoE',
    // body.timestamp: '2018-08-12T10:09:54.092Z',
    // body.user_id: 'AHBrCEjwq4H2TYdj9',
    // body.user_name: 'thangtm',
    // body.text: 'Test Outcome'
    console.log(body);
});

// Creates the endpoint for our webhook
app.get('/listusers', (req, res) => {

    var login = b.login();

    login.then(data => {
        req.session.authToken = data.body.data.authToken;
        req.session.userId = data.body.data.userId;
        b.getListUser(req.session.authToken, req.session.userId, data => {
            console.log(data);
            let temp = data.toString();
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.write("<pre>" + JSON.stringify(data) + "</pre>");
            res.end();
        });
    })


});

app.get("/run", (req, res) => {
    res.end("chạy");
});
