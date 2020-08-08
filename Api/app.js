const express = require('express');
const app = express();


const { mongoose } = require('./db/mongoose');
const bodyParser = require('body-parser');

//Load Mongoose Models
const { List, Task, User } = require('./db/models');

/* MIDDLEWARE */

//Load Middleware
app.use(bodyParser.json());


//CORS Error Correction
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

let verifySession = (req, res, next) => {
    let refreshToken = req.header('x-refresh-token');
    let _id = req.header('_id');

    User.findByIdAndToken(_id, refreshToken).then((user) => {
        if(!user) {
            return Promise.reject({
                'error': 'User not Found. Make sure that the refresh Token and User id are correct'
            });
        }

        //The User is found therefore RefreshToken exist in the db and still need to check if expired is valid or not

        req.user_id = user._id;
        req.userObject = user;
        req.refreshToken = refreshToken;

        let isSessionValid = false;

        user.sessions.forEach((session) => {
            if(session.token === refreshToken ) {
                if(User.hasRefreshTokenExpired(session.expiresAt) === false ){
                    isSessionValid = true;
                }
            }
        });

        if(isSessionValid) {
            //Session is valid - call next() to continue processing this web request 
            next();
        }
        else{
            return Promise.reject({
                'error': 'Refresh Token has expired or the session is invalid'
            })
        }
    }).catch((e) => {
        res.status(401).send(e);
    })
}

/* END MIDDLEWARE */

/* List Routes */

/**
 * GET /lists
 * Purpose: Get all lists from DB
 */

app.get('/lists', (req, res) => {
    // Return an array of all the list in the DB
    List.find({}).then((lists) => {
        res.send(lists);
    });
})

app.post('/lists', (req, res) => {
    // Create a new List and retur the same to the use with its ID
    // The list info will be passed on by the JSON request body
    let title = req.body.title;

    let newList = new List({
        title
    });
    newList.save().then((listDoc) => {
        //Full list document is returned
        res.send(listDoc);
    })
});

app.patch('/lists/:id', (req, res) => {
    // We will update the specified list with the new values specified in th JSON body
    List.findOneAndUpdate({ _id: req.params.id }, {
        $set: req.body
    }).then(() => {
        res.sendStatus(200);
    });
});

app.delete('/lists/:id', (req, res) => {
    // We want to delete the specified list
    List.findOneAndRemove({
        _id: req.params.id
    }).then((removedListDoc) => {
        res.send(removedListDoc);
    })
})

/**
 * Get all tasks in a Specific list
 */
app.get('/lists/:listId/tasks', (req, res) => {
    Task.find({
        _listId: req.params.listId
    }).then((tasks) => {
        res.send(tasks)
    });
})

/**
 * Create a new task in a specified List
 */
app.post('/lists/:listId/tasks', (req, res) => {
    let newTask = new Task({
        title: req.body.title,
        _listId: req.params.listId
    });
    newTask.save().then((newTaskDoc) => {
        res.send(newTaskDoc);
    })
})


/**
 * Update an existing task
 */
app.patch('/lists/:listId/tasks/:taskId', (req, res) => {
    Task.findOneAndUpdate({
        _id: req.params.taskId,
        _listId: req.params.listId
    }, {
        $set: req.body
    }).then(() => {
        res.send({ message: 'Updated Successfully' });
    })
});


/**
 * Delete a task
 */
app.delete('/lists/:listId/tasks/:taskId', (req, res) => {
    Task.findOneAndRemove({
        _id: req.params.taskId,
        _listId: req.params.listId
    }).then((removedTaskDoc) => {
        res.send(removedTaskDoc);
    })
});

/* User Routes */
/**
 * Post /users
 * Purpose: Sign Up
 */

app.post('/users', (req, res) => {
    let body = req.body;
    let newUser = new User(body);

    newUser.save().then(() => {
        return newUser.createSession();
    }).then((refreshToken) => {
        //Session created successfully - refreshToken Returned.
        //Now we Generate an access token for the user

        return newUser.generateAccessAuthToken().then((accessToken) => {
            //Access auth token generated Successfully, now we return an object containing auth token 
            return { accessToken, refreshToken };
        });
    }).then((authTokens) => {
        //Now we construct and send the response to the user with their auth tokens in the header and user object in the body
        res
            .header('x-refresh-token', authTokens.refreshToken)
            .header('x-access-token', authTokens.accessToken)
            .send(newUser);
    }).catch((e) => {
        res.status(400).send(e);
    })
})


/**
 * Post /users/login
 * Purpose: Login
 */
app.post('/users/login', (req, res) => {
    let email = req.body.email;
    let password = req.body.password;

    User.findByCredentials(email, password).then((user) => {
        return user.createSession().then((refreshToken) => {
            //Session created successfully - refreshToken returned.
            //now we generate an access auth token for the user

            return user.generateAccessAuthToken().then((accessToken) => {
                //Access auth token generated Successfully, now we return an object containing auth token 
                return { accessToken, refreshToken };
            });
        }).then((authTokens) => {
            //Now we construct and send the response to the user with their auth tokens in the header and user object in the body
            res
                .header('x-refresh-token', authTokens.refreshToken)
                .header('x-access-token', authTokens.accessToken)
                .send(user);
        })
    }).catch((e) => {
        res.status(400).send(e);
    });
})


/**
 * Generates and Returns Access Tokens
 */

app.get('/users/me/access-token', verifySession, (req, res) => {
    //We know that user is authenticated
    req.userObject.generateAccessAuthToken().then((accessToken) => {
        res.header('x-access-token', accessToken).send({ accessToken });
    }).catch((e) => {
        res.status(400).send(e);
    });
})




app.listen(3000, () => {
    console.log("Server is listening on port 3000");
})