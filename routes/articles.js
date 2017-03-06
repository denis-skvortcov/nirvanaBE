var express = require('express');
var router = express.Router();
var pg = require('pg');
var config = {
    user: 'postgres', //env var: PGUSER
    database: 'nirvana', //env var: PGDATABASE
    host: 'localhost', // Server hosting the postgres database
    port: 5432, //env var: PGPORT
    max: 10, // max number of clients in the pool
    idleTimeoutMillis: 30000 // how long a client is allowed to remain idle before being closed
};

var pool = new pg.Pool(config);

router.get('/', function(req, res, next) {
    pool.connect(function(err, client, done) {
        if(err) {
            return console.error('error fetching client from pool', err);
        }
        client.query('select "id" from "tblArticles"', function(err, result) {
            done(err);
            if(err) {
                return console.error('error running query', err);
            }
            res.send(result.rows);
        });
    });
});

router.get('/:id', function(req, res, next) {
    pool.connect(function(err, client, done) {
        if(err) {
            return console.error('error fetching client from pool', err);
        }
        client.query('select "image", "title", "paragraph" from "tblArticles" as a where a.id = $1::uuid', [req.params.id], function(err, result) {
            done(err);
            if(err) {
                return console.error('error running query', err);
            }
            res.send(result.rows[0]);
        });
    });
});

module.exports = router;
