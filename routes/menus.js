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

router.get('/:name', function(req, res, next) {
    const operator = getOperator(req.param('operator', 'equal'));
    const operatorValue = req.param('level', 0);
    const parentId = getParentId(req.param('parentId', null));
    const levelStr = `ms."level" ${operator} ${operatorValue}`;
    const query = `
        WITH RECURSIVE "tblSubMenu" AS (
            SELECT m.*, 0 as "level"
                FROM "tblMenu" m
                WHERE (${parentId} is null and m."parentId" is null or m."parentId" = ${parentId}::uuid)
            UNION
            
            SELECT m.*, "level" + 1 
                FROM "tblMenu" m, "tblSubMenu" ms
                WHERE m."parentId" = ms."id"
        )
        SELECT ms."id", ms."parentId", ms."title", a."actionType", a."action", ms."level" 
            FROM "tblSubMenu" ms
                JOIN "tblMenuInfo" mi
                     ON mi."id" = ms."menuInfoId"
                JOIN "tblAction" a
                     ON a."id" = ms."actionId"
            WHERE ${levelStr} AND mi."name" = $1
        ORDER BY "level"`;
-
    pool.connect(function(err, client, done) {
        try {
            client.query(query, [req.params.name], function(err, result) {
                if (err) {
                    res.send(err);
                } else {
                    res.send(result.rows);
                }
            });
        } finally {
            done(err);
        }
    });
});

module.exports = router;
