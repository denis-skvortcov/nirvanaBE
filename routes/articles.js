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
        if (err) {
            return console.error('error fetching client from pool', err);
        }
        client.query('select "id", "name" from "tblArticleInfo"', function(err, result) {
            done(err);
            if (err) {
                return console.error('error running query', err);
            }
            res.send(result.rows);
        });
    });
});

router.get('/:name', function(req, res, next) {
    pool.connect(function(err, client, done) {
        const queryCount = `select cast(count(1) as integer) as "recordsCount"
                          from "tblArticleInfo" ai
                          inner join "tblArticles" a on a."articleInfoId" = ai."id"
                          where ai."name" = $1`;
        const parameterCount = [req.params.name];

        const queryIds = `select a."id"
                          from "tblArticleInfo" ai
                          inner join "tblArticles" a on a."articleInfoId" = ai."id"
                          where ai."name" = $1
                          order by a."date" desc
                          limit $2 offset $3`;
        const parameterIds = [req.params.name, req.param('pageSize', 3), parseInt(req.param('pageNumber', 0)) * parseInt(req.param('pageSize', 3))];

        try {
            Promise.all([
                client.query(queryCount, parameterCount),
                client.query(queryIds, parameterIds)
            ]).then(([countResponse, idsResponse]) => {
                res.send({
                    recordsCount: countResponse.rows[0].recordsCount,
                    records: idsResponse.rows
                });
            }).catch((err) => res.send(err));
        } finally {
            done(err);
        }
    });
});

router.get('/:name/:id', function(req, res, next) {
    pool.connect(function(err, client, done) {
        const query = `select 
                        a."id",
                        a."title",
                        a."image",
                        a."paragraph",
                        a."articleInfoId" 
                    from "tblArticles" a 
                    inner join "tblArticleInfo" ai 
                        on ai."id" = a."articleInfoId" 
                        where ai."name" = $1 and a."id" = $2::uuid`;
        const parameters = [req.params.name, req.params.id];

        try {
            client.query(query, parameters, function(err, result) {
                if (err) {
                    res.send(err);
                } else {
                    res.send(result.rows[0]);
                }
            });
        } finally {
            done(err);
        }
    });
});

module.exports = router;
