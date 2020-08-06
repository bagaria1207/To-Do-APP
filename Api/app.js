const express = require('express');
const app = express();


const { mongoose } = require('./db/mongoose');
const bodyParser = require('body-parser');

//Load Mongoose Models
const { List, Task } = require('./db/models');

//Load Middleware
app.use(bodyParser.json());

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
        res.sendStatus(200);
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



app.listen(3000, () => {
    console.log("Server is listening on port 3000");
})