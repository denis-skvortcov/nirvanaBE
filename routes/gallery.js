const express = require('express');
const router = express.Router();
const pg = require('pg');
const config = {
    user: 'postgres', //env var: PGUSER
    database: 'nirvana', //env var: PGDATABASE
    host: 'localhost', // Server hosting the postgres database
    port: 5432, //env var: PGPORT
    max: 10, // max number of clients in the pool
    idleTimeoutMillis: 1000 // how long a client is allowed to remain idle before being closed
};

const pool = new pg.Pool(config);

router.get('/', (req, res, next) => {
    pool.connect((err, client, done) => {
        const query = `
SELECT
    g."id",
    i."path"
FROM "tblGallery" g
   JOIN "tblImages" i
        ON i."essenceToImageId" = g."essenceToImageId"
WHERE   g."parentId" is null
        AND i."size" = $1
ORDER BY g."date" DESC;`;
        const parameters = [req.query.imgSize || 'S'];

        client.query(query, parameters)
            .then((result) => {
                done(err);
                res.send(result.rows);
            })
            .catch((err) => {
                done(err);
                res.send(err);
            });
    });
});

router.get('/:parentId', (req, res, next) => {
    pool.connect((err, client, done) => {
        const query = `
SELECT
    g."parentId",
    i."path"
FROM "tblGallery" g
    JOIN "tblImages" i
        ON i."essenceToImageId" = g."essenceToImageId"
WHERE
    g."parentId" = $1::uuid
    AND i."size" = $2;`;
        const parameters = [req.params.parentId, req.query.imgSize || 'S'];

        client.query(query, parameters)
            .then((result) => {
                done(err);
                res.send(result.rows);
            })
            .catch((err) => {
                done(err);
                res.send(err);
            });
    });
});

module.exports = router;
