const mongoose = require('mongoose');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

//JWT Secret
const jwtSecret = "48405339707141025312iahsioqoqbofnpqmcpomqcom4056052324";

const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        minlength: 1,
        trim: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    sessions: [{
        token: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Number,
            required: true
        }
    }]
});

//Methods

UserSchema.methods.toJSON = function () {
    const user = this;
    const unserObject = user.toObject();

    //return the document except the password and sessions(these shouldn't be made available)
    return _.omit(unserObject, ['password', 'sessions']);
}

UserSchema.methods.generateAccessAuthToken = function () {
    const user = this;
    return new Promise((resolve, reject) => {
        //Create JSON Web Token and return that
        jwt.sign({ _id: user._id.toHexString() }, jwtSecret, { expiresIn: "10m" }, (err, token) => {
            if (!err) {
                resolve(token);
            }
            else {
                reject();
            }
        })
    })
}

UserSchema.methods.generateRefreshAuthToken = function () {
    return new Promise((resolve, reject) => {
        crypto.randomBytes(64, (err, buf) => {
            if (!err) {
                let token = buf.toString('hex');
                return resolve(token)
            }
        })
    })
}

UserSchema.methods.createSession = function () {
    let user = this;
    return user.generateRefreshAuthToken().then((refreshToken) => {
        return saveSessionToDatabase(user, refreshToken);
    }).then((refreshToken) => {
        //saved to DB Successfully
        //now return the refresh Token
        return refreshToken;
    }).catch((e) => {
        return Promise.reject('Failed to save session to Database.\n' + e);
    })
}

/* MODEL METHODS (Static Methods) */


UserSchema.statics.getJWTSecret = () => {
    return jwtSecret;
}

UserSchema.statics.findByIdAndToken = function (_id, token) {
    //find user by id and token
    //used in auth middleware(verify session)

    const User = this;
    return User.findOne({
        _id,
        'sessions.token': token
    });
}

UserSchema.statics.findByCredentials = function (email, password) {
    let User = this;
    return User.findOne({ email }).then((user) => {
        if (!user) {
            return Promise.reject();
        }
        else {
            return new Promise((resolve, reject) => {
                bcrypt.compare(password, user.password, (err, res) => {
                    if (res) {
                        resolve(user);
                    }
                    else {
                        reject();
                    }
                })
            })
        }
    })
}


UserSchema.statics.hasRefreshTokenExpired = (expiresAt) => {
    let secondSinceEpoch = Date.now() / 1000;
    if(expiresAt > secondSinceEpoch) { 
        return false;
    }
    else{
        //Has Expired
        return true;
    }
}

/* MiddleWare */
UserSchema.pre('save', function (next) {
    let user = this;
    let costFactor = 10; //Number of hasing rounds

    if (user.isModified('password')) {
        //If changed run this Code
        //Generate the salt and Hash The Password

        bcrypt.genSalt(costFactor, (err, salt) => {
            bcrypt.hash(user.password, salt, (err, hash) => {
                user.password = hash;
                next();
            })
        })
    } else {
        next();
    }
});



/* HELPER Methods */

let saveSessionToDatabase = (user, refreshToken) => {
    // Save session to DB
    return new Promise((resolve, reject) => {
        let expiresAt = generateRefreshTokenExpiryTime();
        user.sessions.push({ 'token': refreshToken, expiresAt });
        user.save().then(() => {
            //Save session successfully
            return resolve(refreshToken);
        }).catch((e) => {
            reject(e);
        });
    })
}


let generateRefreshTokenExpiryTime = () => {
    let daysUntilExpire = "10";
    let secondsUntilExpire = ((daysUntilExpire * 24) * 60) * 60;
    return ((Date.now() / 1000) + secondsUntilExpire);
}

const User = mongoose.model('User', UserSchema);

module.exports = { User }