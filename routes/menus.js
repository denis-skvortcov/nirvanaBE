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
        client.query('select "id", "name" from "tblMenuInfo"', function(err, result) {
            done(err);
            res.send(result.rows);
        });
    });
});
function sort(subMenu, parentId) {
    if (subMenu.length === 0 || !subMenu.some((subMenuItem) => subMenuItem['parentId'])) {
        return subMenu;
    } else {
        const rootMenu = subMenu.filter((subMenuItem) => subMenuItem.parentId === parentId);
        subMenu = subMenu.filter((subMenuItem) => subMenuItem.parentId !== parentId);
        rootMenu.map((rootMenuItem) => {
            if (subMenu.some((subMenuItem) => subMenuItem.parentId === rootMenuItem.id)) {
                rootMenuItem[rootMenuItem.id] = sort(subMenu, rootMenuItem.id);
            }
        });
        return rootMenu;
    }
}
router.get('/:name/:relation', function(req, res, next) {
    const queryByMainMenuId = `
        WITH RECURSIVE "tblSubMenu" AS (
            SELECT m.*, 1 as "level"
            FROM "tblMenu" m
            WHERE m."parentId" is not null and m."parentId" = $1::uuid
            UNION
            SELECT m.*, "level" + 1 
            FROM "tblMenu" m, "tblSubMenu" ms
            WHERE m."parentId" = ms."id"
        )
        SELECT ms."id", ms."parentId", ms."title", ms."actionType", ms."action", ms."level" FROM "tblSubMenu" ms
        inner join "tblMenuInfo" mi on mi."id" = ms."menuInfoId"
        order by "title"`;

    pool.connect(function(err, client, done) {
        var query = `select m."action", m."actionType", m."id", m."title" from "tblMenu" m 
                        inner join "tblMenuInfo" mi on mi."id" = m."menuInfoId" 
                            where mi."name" = $1 and m."parentId" is null`;
        var parameters = [req.params.name];
        if (req.params.relation !== 'root') {
            query = queryByMainMenuId;
            parameters = [req.params.relation]
        }
        try {
            client.query(query, parameters, function(err, result) {
                if (err) {
                    res.send(err);
                } else {
                    res.send(sort(result.rows, parameters[0]));
                    // res.send(result.rows);
                }
            });
        } finally {
            done(err);
        }
    });
});

module.exports = router;
