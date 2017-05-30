const express = require('express');
const router = express.Router();
const pg = require('pg');
const config = {
    user: 'postgres', //env var: PGUSER
    database: 'nirvana', //env var: PGDATABASE
    host: 'localhost', // Server hosting the postgres database
    port: 5432, //env var: PGPORT
    max: 10, // max number of clients in the pool
    idleTimeoutMillis: 30000 // how long a client is allowed to remain idle before being closed
};

const pool = new pg.Pool(config);

router.get('/', function(req, res, next) {
    pool.connect(function(err, client, done) {
        const query = ` SELECT  g."galleryInfoId",
                                i."path"
                        FROM "tblGallery" g
	                        JOIN "tblImages" i
                                ON i."essenceToImageId" = g."essenceToImageId"
                        WHERE g."parentId" is null and i."size" = $1
                        ORDER BY g."date";`;
        const parameters = [req.param('imgSize', 'S')];
        client.query(query, parameters)
            .then((result) => res.send(result.rows))
            .catch((err) => res.send(err));
    });
});

router.get('/:galleryInfoId', function(req, res, next) {
    pool.connect(function(err, client, done) {
        if (err) {
            return console.error('error fetching client from pool', err);
        }
        const query = ` SELECT  g."galleryInfoId",
                               	i."path"
                        FROM "tblGallery" g
                            JOIN "tblImages" i
                                ON i."essenceToImageId" = g."essenceToImageId"
                        WHERE   g."parentId" is not null
                                AND g."galleryInfoId" = $1
                                AND i."size" = $2;`;
        const parameters = [req.params.galleryInfoId, req.param('imgSize', 'S')];
        client.query(query, parameters)
            .then((result) => res.send(result.rows))
            .catch((err) => res.send(err));
    });
});

// router.get('/:galleryInfoId', function(req, res, next) {
//     pool.connect(function(err, client, done) {
//         const queryCount = `SELECT CAST(count(1) as integer) as "recordsCount"
//                             FROM "tblGallery" g
//                                 JOIN "tblGalleryInfo" gi
//                                     ON g."galleryInfoId" = gi."id"
//                             WHERE g."parentId" IS NOT null
//                                   AND gi."id" = $1;`;
//         const parameterCount = [req.params.name];
//
//         const queryIds = ` SELECT   g."galleryInfoId",
//                                     i."path",
//                                     t."title",
//                                     g."paragraph"
//                            FROM "tblGallery" g
//                                 JOIN "tblImages" i
//                                     ON g."essenceToImageId" = i."essenceToImageId"
//                                 JOIN "tblTitle" t
//                                     ON g."titleId" = t."id"
//                                 JOIN "tblGalleryInfo" gi
//                                     ON g."galleryInfoId" = gi."id"
//                            WHERE g."parentId" IS NOT null
//                                 AND g."galleryInfoId" = $1
//                                 AND i."size" = 'S'
//                            ORDER BY g."date" DESC, t."title"
//                            LIMIT $2 OFFSET $3;`;
//         const parameterIds = [req.params.name, req.param('pageSize', 3), parseInt(req.param('pageNumber', 0)) * parseInt(req.param('pageSize', 3))];
//
//         try {
//             Promise.all([
//                 client.query(queryCount, parameterCount),
//                 client.query(queryIds, parameterIds)
//             ]).then(([countResponse, idsResponse]) => {
//                 res.send({
//                     recordsCount: countResponse.rows[0].recordsCount,
//                     records: idsResponse.rows
//                 });
//             }).catch((err) => res.send(err));
//         } finally {
//             done(err);
//         }
//     });
// });

module.exports = router;
