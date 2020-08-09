const express = require('express');
const app = express();


const { mongoose } = require('./db/mongoose');
const bodyParser = require('body-parser');

//Load Mongoose Models
const { List, Task, User } = require('./db/models');


const jwt = require('jsonwebtoken');

/* MIDDLEWARE */

//Load Middleware
app.use(bodyParser.json());


//CORS Error Correction
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-access-token, x-refresh-token, _id");

    res.header(
        'Access-Control-Expose-Headers',
        'x-access-token, x-refresh-token'
    );

    next();
})

//check whethe the request has a Valid JWT access token
let authenticate = (req, res, next) => {
    let token = req.header('x-access-token');

    //verify the JWT
    jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
        if (err) {
            //If jwt is INVALID do not Authenticate
            res.status(401).send(err);
        } else {
            //Jwt is Valid
            req.user_id = decoded._id;
            next();
        }
    })
}


//Verify Refresh Token MiddleWare (which will be verifying the session)
let verifySession = (req, res, next) => {
    let refreshToken = req.header('x-refresh-token');
    let _id = req.header('_id');

    User.findByIdAndToken(_id, refreshToken).then((user) => {
        if (!user) {
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
            if (session.token === refreshToken) {
                if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
                    isSessionValid = true;
                }
            }
        });

        if (isSessionValid) {
            //Session is valid - call next() to continue processing this web request 
            next();
        }
        else {
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

app.get('/lists', authenticate, (req, res) => {
    // Return an array of all the list in the DB that belong to the authenticated user
    List.find({
        _userId: req.user_id
    }).then((lists) => {
        res.send(lists);
    }).catch((e) => {
        res.send(e);
    });
})

app.post('/lists', authenticate, (req, res) => {
    // Create a new List and retur the same to the use with its ID
    // The list info will be passed on by the JSON request body
    let title = req.body.title;

    let newList = new List({
        title,
        _userId: req.user_id
    });
    newList.save().then((listDoc) => {
        //Full list document is returned
        res.send(listDoc);
    })
});

app.patch('/lists/:id', authenticate, (req, res) => {
    // We will update the specified list with the new values specified in th JSON body
    List.findOneAndUpdate({ _id: req.params.id, _userId: req.user_id }, {
        $set: req.body
    }).then(() => {
        res.send({ 'message': 'updated successfully'});
    });
});

app.delete('/lists/:id', authenticate, (req, res) => {
    // We want to delete the specified list
    List.findOneAndRemove({
        _id: req.params.id,
        _userId: req.user_id
    }).then((removedListDoc) => {
        res.send(removedListDoc);
        //delte all the task that are in the list
        deleteTaskFromList(removedListDoc._id);
    })
})

/**
 * Get all tasks in a Specific list
 */
app.get('/lists/:listId/tasks', authenticate, (req, res) => {
    Task.find({
        _listId: req.params.listId
    }).then((tasks) => {
        res.send(tasks)
    });
})

/**
 * Create a new task in a specified List
 */
app.post('/lists/:listId/tasks', authenticate, (req, res) => {
    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            //Valid Object so currently authenticated user can create tasks
            return true;
        }
        else {
            return false;
        }
    }).then((canCreateTask) => {
        if (canCreateTask) {
            let newTask = new Task({
                title: req.body.title,
                _listId: req.params.listId
            });
            newTask.save().then((newTaskDoc) => {
                res.send(newTaskDoc);
            })
        }
        else {
            res.sendStatus(404);
        }
    })

})


/**
 * Update an existing task
 */
app.patch('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            return true;
        }
        return false;
    }).then((canUpdateTasks) => {
        if (canUpdateTasks) {
            Task.findOneAndUpdate({
                _id: req.params.taskId,
                _listId: req.params.listId
            }, {
                $set: req.body
            }
            ).then(() => {
                res.send({ message: 'Updated Successfully' });
            })
        } else {
            res.sendStatus(404);
        }
    })
});


/**
 * Delete a task
 */
app.delete('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            return true;
        }
        return false;
    }).then((canDeleteTasks) => {
        if (canDeleteTasks) {
            Task.findOneAndRemove({
                _id: req.params.taskId,
                _listId: req.params.listId
            }).then((removedTaskDoc) => {
                res.send(removedTaskDoc);
            })
        }
        else {
            res.sendStatus(404);
        }
    });
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


/* Helper Method */
let deleteTaskFromList = (_listId) => {
    Task.deleteMany({
        _listId
    }).then(() => {
        console.log("Tasks from " + _listId + "were Deleted");
    })
}


app.listen(3000, () => {
    console.log("Server is listening on port 3000");
})