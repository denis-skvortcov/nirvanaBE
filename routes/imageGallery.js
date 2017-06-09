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

router.get('/:parentId', (req, res, next) => {
    pool.connect((err, client, done) => {
        const queryCount = `
SELECT cast(count(1) AS integer) AS "recordsCount"
FROM "tblGallery" g
WHERE g."parentId" = $1;`;
        const parameterCount = [req.params.name];

        const queryIds = `
SELECT g."id"
FROM "tblGallery" g
WHERE g."parentId" = $1
ORDER BY g."date" DESC
LIMIT $2 OFFSET $3;`;
        const parameterIds = [req.params.parentId, req.query.pageSize || 3, parseInt(req.query.pageNumber || 0) * parseInt(req.query.pageSize || 3)];

        Promise.all([
            client.query(queryCount, parameterCount),
            client.query(queryIds, parameterIds)
        ]).then(([countResponse, idsResponse]) => {
            done(err);
            res.send({
                recordsCount: countResponse.rows[0].recordsCount,
                records: idsResponse.rows
            });
        }).catch((err) => {
            done(err);
            res.send(err);
        });
    });
});

router.get('/:name/:id', (req, res, next) => {
    pool.connect((err, client, done) => {
        const query = `
SELECT
    ar."id",
    ar."title",
    ar."paragraph",
    ar."articleInfoId",
    i."path",
    ac."action"
FROM "tblArticles" ar
    JOIN "tblImages" i 
        ON ar."essenceToImageId" = i."essenceToImageId"
    JOIN "tblArticleInfo" ai
        ON ar."articleInfoId" = ai."id"
    JOIN "tblAction" ac
        ON ac."id" = ar."actionId"
WHERE
    ai."name" = $1
    AND ar."id" = $2::uuid
    AND i."size" = $3;`;
        const parameters = [req.params.name, req.params.id, req.query.imgSize || 'S'];

        client.query(query, parameters)
            .then((result) => {
                done(err);
                res.send(result.rows[0]);
            })
            .catch((err) => {
                done(err);
                res.send(err);
            });
    });
});

router.patch('/:id', (req, res, next) => {
    pool.connect((err, client, done) => {
        const query = `
UPDATE "tblArticles"
    SET "essenceToImageId" = $2::uuid
WHERE "id" = $1::uuid;`;
        const parameters = [req.params.id, req.body.essenceToImageId];

        client.query(query, parameters)
            .then((result) => {
                done(err);
                res.send(result.rows[0]);
            })
            .catch((err) => {
                done(err);
                res.send(err);
            });
    });
});

module.exports = router;
