const express = require('express');
const path = require('path');
const router = express.Router();
const pg = require('pg');
const sharp = require('sharp');
const fs = require('fs');
const config = {
    user: 'postgres', //env var: PGUSER
    database: 'nirvana', //env var: PGDATABASE
    host: 'localhost', // Server hosting the postgres database
    port: 5432, //env var: PGPORT
    max: 10, // max number of clients in the pool
    idleTimeoutMillis: 30000 // how long a client is allowed to remain idle before being closed
};

const pool = new pg.Pool(config);

const sizes = {
    RS: 854,
    RM: 1280,
    RL: 1920,
    RXL: 3840,
    RXXL: 7680,
    S: 480,
    M: 720,
    L: 1080,
    XL: 2160,
    XXL: 4320
};

const directoryImg = 'img';
const directoryPublic = `public`;

const directory = {
    original: `./${directoryPublic}/${directoryImg}/original`,
    article: `./${directoryPublic}/${directoryImg}/article`
};

function parsetListFiles(filesList) {
    return Promise.all(Object.values(filesList).map((file) => saveFile(file)));
}

class Deferred {
    constructor(asyncMethod, ...methodsParameters) {
        const vm = this;
        Object.assign(vm, {
            promise: new Promise(vm.executor.bind(this)),
        });
        vm.executeExternalMethod(asyncMethod, ...methodsParameters);
    }

    executor(resolve, reject) {
        const vm = this;
        Object.assign(vm, {resolve, reject});
    }

    resolveResult(error, ...results) {
        const vm = this;
        if (error) vm.reject(error);
        if (results && results.length) vm.resolve(...results);
        vm.resolve();
    }

    executeExternalMethod(asyncMethod, ...methodsParameters) {
        const vm = this;
        if (typeof asyncMethod === 'function') {
            asyncMethod(...methodsParameters, vm.resolveResult.bind(vm));
        }
    }
}

class ReverseDeferred extends Deferred {
    constructor(asyncMethod, ...methodsParameters) {
        super(asyncMethod, ...methodsParameters);
    }

    resolveResult(error, ...results) {
        const vm = this;
        if (error) vm.resolve(error);
        if (results && results.length) vm.reject(...results);
        vm.reject();
    }
}

function saveFile(file) {
    const directoryOriginal = `./${directoryPublic}/${directoryImg}/original`;
    return createDirectory(directoryOriginal).then(() => {
        return new Deferred(file.mv, `${directoryOriginal}/${file.name}`).promise.then(() => {
            const directoryResizeImage = `./${directoryPublic}/${directoryImg}/` + String(Math.random()).substr(2);
            return createDirectory(directoryResizeImage).then(() => {
                 return createResizeImage(sharp(file.data), directoryResizeImage, file.name);
            });
        });
    });
}

function createDirectory(directory) {
    const defer = new Deferred();
    isResourceExists(directory).then(() => {
        (new Deferred(fs.mkdir, directory)).promise.then((newDirectory) => {
            defer.resolve(newDirectory);
        });
    }).catch(() => {
        defer.resolve(directory);
    });
    return defer.promise;
}

function isResourceExists(path) {
    const fileMode = fs.constants.R_OK | fs.constants.W_OK;
    return (new ReverseDeferred(fs.access, path, fileMode)).promise;
}

function getResizedFileName(directory, imageName, newSize) {
    return `${directory}/${imageName}-${newSize}.png`;
}

function createResizeImage(image, directory, fileName) {
    return image.metadata().then((imageOrigin) => {
        const maxDimension = Math.max(imageOrigin.width, imageOrigin.height);
        const width = maxDimension === imageOrigin.width && imageOrigin.width;
        const height = maxDimension === imageOrigin.height && imageOrigin.height;
        const filesInfoCollection = [];

        Object.keys(sizes).forEach((sizeName) => {
            const size = sizes[sizeName];
            const imagePath = getResizedFileName(directory, fileName, size);
            if (maxDimension > size) {
                image.resize(width && size || null, height && size || null);
            }
            const imagePathOpen = imagePath.replace(`/${directoryPublic}`, '');
            filesInfoCollection.push({imagePathOpen, sizeName});
            image.png().toFile(imagePath);
        });
        return {filesInfoCollection, originalFileName: fileName};
    });
}

function saveFilesListToDatabase(filesList, res, parameterCollection) {
    const originalFileNamesList = [];
    const newFilesList = {};
    filesList.forEach((fileInfo) => {
        originalFileNamesList.push(`('${fileInfo.originalFileName}')`);
        newFilesList[fileInfo.originalFileName] = fileInfo.filesInfoCollection.map((newFile) => {
            return `('${newFile.imagePathOpen}', '${newFile.sizeName}', '<fileIdPlace>')`;
        });
    });
    const essenceToImageQuery = `insert into "tblEssenceToImage" ("originalFileName")
                                    values ${originalFileNamesList.join(', ')}
                                    returning "id", "originalFileName"`;
    pool.connect((err, client, done) => {
        try {
            client.query(essenceToImageQuery, []).then((result) => {
                let query = 'insert into "tblImages" ("path", "size", "essenceToImageId") values ';
                const insertedRows = result.rows.map((row) => {
                    const values = newFilesList[row.originalFileName].map((newFile) => {
                        return newFile.replace('<fileIdPlace>', row.id);
                    });
                    query += `${values.join(', ')}, `;
                    return row.id;
                });
                query = `${query.substr(0, query.length - 2)}`;
                return client.query(query, []).then(() => {
                    res.send(insertedRows);
                });
            }).catch((err) => res.status(500).send(err));
        } finally {
            done(err);
        }
    });
}

router.post('/', function(req, res, next) {
    if (!req.files) {
        return res.status(400).send('No files were uploaded.');
    }
    const saveError = {error: -1, errorMessage: 'File already exists'};
    const filesList = req.files;
    const resourcePromises = [];
    const checkFilesList = (directoryName) => Object.values(filesList).forEach((file) => {
        resourcePromises.push(isResourceExists(`${directoryName}/${file.name}`));
    });
    //const parameterCollection = [req.param('collectionType'), req.param('collectionName')];
    Object.values(directory).forEach(checkFilesList);
    Promise.all(resourcePromises)
        .then(() => {
            const directoriesPromises = Object.values(directory).map((directoryName) => createDirectory(directoryName));
            Promise.all(directoriesPromises)
                .then(() => parsetListFiles(filesList))
                .then((filesListInfo) => saveFilesListToDatabase(filesListInfo, res))
                .catch((error) => {
                    // TODO: send 500 unexpected behaviour, write to log!!!
                    return res.status(500).send(saveError);
                });
        })
        .catch((error) => {
            // TODO: send error original directory exists if needed or only write to log
            return res.status(500).send(saveError);
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
