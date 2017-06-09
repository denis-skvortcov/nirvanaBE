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

router.get('/', (req, res, next) => {
    pool.connect((err, client, done) => {
        const query = `
SELECT
    "id",
    "name"
FROM "tblMenuInfo"`;
        const parameters = [];

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

function getOperator(parameter) {
    const operators = {
        equal: '=',
        lessOrEqual: '<=',
        moreOrEqual: '>='
    };
    const operatorsMap = {
        equal: 'equal',
        'less-or-equal': 'lessOrEqual',
        'more-or-equal': 'moreOrEqual'
    };
    return operators[operatorsMap[parameter]];
}

function getParentId(parentId) {
    return parentId === null ? parentId : `'${parentId}'`;
}

router.get('/:name', (req, res, next) => {
    pool.connect((err, client, done) => {
        const operator = getOperator(req.query.operator || 'equal');
        const operatorValue = req.query.level || 0;
        const parentId = getParentId(req.query.parentId || null);
        const levelStr = `ms."level" ${operator} ${operatorValue}`;
        const query = `
WITH RECURSIVE "tblSubMenu"
    AS(
        SELECT
            m.*,
            0 as "level"
        FROM "tblMenu" m
        WHERE
            (${parentId} IS null AND m."parentId" IS null
            OR m."parentId" = ${parentId}::uuid)
    UNION            
        SELECT
            m.*,
            "level" + 1 
        FROM
            "tblMenu" m,
            "tblSubMenu" ms
        WHERE m."parentId" = ms."id"
    )
SELECT
    ms."id",
    ms."parentId",
    ms."title",
    a."actionType",
    a."action",
    ms."level" 
FROM "tblSubMenu" ms
    JOIN "tblMenuInfo" mi
        ON mi."id" = ms."menuInfoId"
    JOIN "tblAction" a
        ON a."id" = ms."actionId"
WHERE
    ${levelStr}
    AND mi."name" = $1
ORDER BY "level"`;
        const parameters = [req.params.name];
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
