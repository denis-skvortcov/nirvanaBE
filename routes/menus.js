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
        client.query('select "id", "name" from "tblMenuInfo"', function(err, result) {
            done(err);
            res.send(result.rows);
        });
    });
});

router.get('/:name/:relation', function(req, res, next) {
    pool.connect(function(err, client, done) {
        var query  = 'select m."action", m."actionType", m."id", m."title" from "tblMenu" m ' +
            'inner join "tblMenuInfo" mi on mi."id" = m."menuInfoId" where mi."name" = $1 and m."parentId" is null';
        var parameters = [req.params.name];
        if (req.params.relation !== 'root') {
            query = 'select m."action", m."actionType", m."title" from "tblMenu" m ' +
                'inner join "tblMenuInfo" mi on mi."id" = m."menuInfoId" where mi."name" = $1 and m."parentId" = $2::uuid';
            parameters.push(req.params.relation);
        }
        try {
            client.query(query, parameters, function (err, result) {
                console.log(err);
                res.send(result.rows);
            });
        } catch(err) {
            res.send(err);
        } finally {
            done(err);
        }
    });
});

module.exports = router;
