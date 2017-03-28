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

const imgDirectoryName = 'img';
const publicDirectoryName = 'public';
const originalDirectoryName = 'original';
const articlesDirectoryName = 'article';
const outputFileType = 'png';

const directory = {
    [originalDirectoryName]: `./${publicDirectoryName}/${imgDirectoryName}/${originalDirectoryName}`,
    [articlesDirectoryName]: `./${publicDirectoryName}/${imgDirectoryName}/${articlesDirectoryName}`
};

class Deferred {
    constructor(asyncMethod, ...methodsParameters) {
        const vm = this;
        Object.assign(vm, {
            promise: new Promise(vm.executor.bind(this))
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

function parsetListFiles(filesList) {
    return Promise.all(Object.values(filesList).map((file) => saveFile(file)));
}

function saveFile(file) {
    const directoryOriginal = `./${publicDirectoryName}/${imgDirectoryName}/${originalDirectoryName}`;
    return createDirectory(directoryOriginal).then(() => {
        const originalFileName = file.name;
        return new Deferred(file.mv, `${directoryOriginal}/${originalFileName}`).promise.then(() => {
            const directoryResizeImage = `./${publicDirectoryName}/${imgDirectoryName}/` + String(Math.random()).substr(2);
            return createDirectory(directoryResizeImage).then(() => {
                return createResizeImage(sharp(file.data), directoryResizeImage, originalFileName);
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
    return `${directory}/${imageName}-${newSize}.${outputFileType}`;
}

function createResizeImage(image, directory, originalFileName) {
    return image.metadata().then((imageOrigin) => {
        const fileName = originalFileName.replace(path.extname(originalFileName), '');
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
            const imagePathOpen = imagePath.replace(`./${publicDirectoryName}`, '');
            filesInfoCollection.push({imagePathOpen, sizeName});
            image[outputFileType]().toFile(imagePath);
        });
        return {filesInfoCollection, originalFileName};
    });
}

function saveFilesListToDatabase(filesList, res) {
    const originalFileList = [];
    const newFilesList = {};
    const fieldIdMarker = '<fileIdPlace>';

    filesList.forEach((fileInfo) => {
        const pathOriginalFile = `/${imgDirectoryName}/${originalDirectoryName}/${fileInfo.originalFileName}`;
        const fileName = fileInfo.originalFileName.replace(path.extname(fileInfo.originalFileName), '');
        originalFileList.push(`('${fileName}', '${pathOriginalFile}')`);
        newFilesList[fileName] = fileInfo.filesInfoCollection.map((newFile) => {
            return `('${newFile.imagePathOpen}', '${newFile.sizeName}', '${fieldIdMarker}')`;
        });
    });
    const essenceToImageQuery = `insert into "tblEssenceToImage" ("originalFileName", "path")
                                    values ${originalFileList.join(', ')}
                                    returning "id", "originalFileName"`;
    pool.connect((err, client, done) => {
        client.query(essenceToImageQuery, []).then((result) => {
            let query = 'insert into "tblImages" ("path", "size", "essenceToImageId") values ';
            const imageToEssenceList = result.rows;
            imageToEssenceList.forEach((row) => {
                const values = newFilesList[row.originalFileName].map((newFile) => {
                    return newFile.replace(fieldIdMarker, row.id);
                });
                query += `${values.join(', ')}, `;
            });
            query = `${query.substr(0, query.length - 2)}`;
            return client.query(query, []).then(() => res.send(imageToEssenceList));
        //    TODO: Event or Endpoint 
        }).catch((err) => res.status(500).send(err));
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

router.get('/', function(req, res, next) {
    pool.connect(function(err, client, done) {
        const query = `select "id", "originalFileName", "path"
                       from "tblEssenceToImage"`;
        try {
            client.query(query, [], function(err, result) {
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

router.get('/:id', function(req, res, next) {
    pool.connect(function(err, client, done) {
        const query = `select "id", "originalFileName", "path"
                       from "tblEssenceToImage"
                       where "id" = $1`;
        try {
            client.query(query, [req.params.id], function(err, result) {
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
