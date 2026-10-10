const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const db = new sqlite3.Database(path.join(__dirname, 'database.db'));
const uploadsDirectory = path.join(__dirname, 'public', 'uploads');
const maxPhotoBytes = 3 * 1024 * 1024;

function dbRun(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, values, function (error) {
            if (error) return reject(error);
            resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function dbGet(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, values, (error, row) => {
            if (error) return reject(error);
            resolve(row);
        });
    });
}

function dbAll(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, values, (error, rows) => {
            if (error) return reject(error);
            resolve(rows);
        });
    });
}

async function ensureCoverColumn(table) {
    const columns = await dbAll(`PRAGMA table_info(${table})`);
    if (!columns.some(column => column.name === 'cover')) {
        await dbRun(`ALTER TABLE ${table} ADD COLUMN cover TEXT`);
    }
}

async function initializeDatabase() {
    await dbRun('CREATE TABLE IF NOT EXISTS anime(id INTEGER PRIMARY KEY,title TEXT,watched INTEGER,maxEpisodes INTEGER,cover TEXT)');
    await dbRun('CREATE TABLE IF NOT EXISTS manga(id INTEGER PRIMARY KEY,title TEXT,readChapters INTEGER,maxChapters INTEGER,cover TEXT)');
    await ensureCoverColumn('anime');
    await ensureCoverColumn('manga');
    await fs.mkdir(uploadsDirectory, { recursive: true });
}

async function savePhoto(dataUrl) {
    if (dataUrl == null) return null;

    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) throw new Error('Choose a JPEG, PNG, or WebP image.');

    const mimeType = match[1];
    const image = Buffer.from(match[2], 'base64');
    if (!image.length || image.length > maxPhotoBytes) {
        throw new Error('Images must be 3 MB or smaller.');
    }

    const validSignature = mimeType === 'image/jpeg'
        ? image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
        : mimeType === 'image/png'
            ? image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
            : image.length >= 12 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP';
    if (!validSignature) throw new Error('The selected file is not a valid image.');

    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
    const filename = `${crypto.randomUUID()}.${extension}`;
    await fs.writeFile(path.join(uploadsDirectory, filename), image, { flag: 'wx' });
    return `/uploads/${filename}`;
}

async function deletePhoto(photoPath) {
    if (typeof photoPath !== 'string' || !photoPath.startsWith('/uploads/')) return;
    try {
        await fs.unlink(path.join(uploadsDirectory, path.basename(photoPath)));
    } catch (error) {
        if (error.code !== 'ENOENT') console.error('Could not delete photo:', error);
    }
}

async function createMedia(table, columns, values, req, res) {
    let photoPath;
    try {
        photoPath = await savePhoto(req.body.cover);
        const result = await dbRun(
            `INSERT INTO ${table}(${columns},cover) VALUES(${values.map(() => '?').join(',')},?)`,
            [...values, photoPath]
        );
        res.json({ id: result.id });
    } catch (error) {
        await deletePhoto(photoPath);
        res.status(error.message.startsWith('SQLITE_') ? 500 : 400).json({ error: error.message });
    }
}

async function updateMedia(table, id, fields, values, req, res) {
    let current;
    let nextPhoto;
    try {
        current = await dbGet(`SELECT cover FROM ${table} WHERE id = ?`, [id]);
        if (!current) return res.status(404).json({ error: 'Item not found.' });

        nextPhoto = req.body.cover === undefined || req.body.cover === current.cover
            ? current.cover
            : await savePhoto(req.body.cover);

        const result = await dbRun(
            `UPDATE ${table} SET ${fields}, cover = ? WHERE id = ?`,
            [...values, nextPhoto, id]
        );
        if (result.changes === 0) {
            if (nextPhoto !== current.cover) await deletePhoto(nextPhoto);
            return res.status(404).json({ error: 'Item not found.' });
        }

        if (nextPhoto !== current.cover) await deletePhoto(current.cover);
        res.json({ updated: true });
    } catch (error) {
        if (current && nextPhoto && nextPhoto !== current.cover) await deletePhoto(nextPhoto);
        res.status(error.message.startsWith('SQLITE_') ? 500 : 400).json({ error: error.message });
    }
}

async function deleteMedia(table, id, res) {
    try {
        const current = await dbGet(`SELECT cover FROM ${table} WHERE id = ?`, [id]);
        if (!current) return res.status(404).json({ error: 'Item not found.' });

        const result = await dbRun(`DELETE FROM ${table} WHERE id = ?`, [id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Item not found.' });

        await deletePhoto(current.cover);
        res.json({ deleted: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

app.get('/api/anime', async (req, res) => {
    try {
        res.json(await dbAll('SELECT * FROM anime'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/manga', async (req, res) => {
    try {
        res.json(await dbAll('SELECT * FROM manga'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/anime', (req, res) => {
    const { title, watched, maxEpisodes } = req.body;
    createMedia('anime', 'title,watched,maxEpisodes', [title, watched, maxEpisodes], req, res);
});

app.post('/api/manga', (req, res) => {
    const { title, readChapters, maxChapters } = req.body;
    createMedia('manga', 'title,readChapters,maxChapters', [title, readChapters, maxChapters], req, res);
});

app.put('/api/anime/:id', (req, res) => {
    const { maxEpisodes, watched } = req.body;
    updateMedia('anime', req.params.id, 'maxEpisodes = ?, watched = ?', [maxEpisodes, watched], req, res);
});
app.put('/api/manga/:id', (req, res) => {
    const { maxChapters, readChapters } = req.body;
    updateMedia('manga', req.params.id, 'maxChapters = ?, readChapters = ?', [maxChapters, readChapters], req, res);
});
app.delete('/api/anime/:id', (req, res) => {
    deleteMedia('anime', req.params.id, res);
});
app.delete('/api/manga/:id', (req, res) => {
    deleteMedia('manga', req.params.id, res);
});

const PORT = process.env.PORT || 3000;
initializeDatabase()
    .then(() => app.listen(PORT, () => console.log(`AniTrack is running at http://localhost:${PORT}`)))
    .catch(error => {
        console.error('Could not initialize the database:', error);
        process.exitCode = 1;
    });