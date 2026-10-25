const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DEEZER_URL = process.env.DEEZER_API_URL || 'https://api.deezer.com';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---------- Поиск через Deezer ----------
app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Параметр q обязателен' });

  try {
    const url = `${DEEZER_URL}/search?q=${encodeURIComponent(q)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Deezer вернул статус ${response.status}`);
    const data = await response.json();

    const results = (data.data || []).slice(0, 10).map((t) => ({
      title: t.title,
      artist: t.artist ? t.artist.name : 'Unknown',
      preview_url: t.preview || null,
    }));

    res.json({ results });
  } catch (err) {
    console.error('Ошибка Deezer:', err.message);
    res.status(502).json({ error: 'Ошибка внешнего сервиса: ' + err.message });
  }
});

// ---------- Плейлисты: список ----------
app.get('/api/playlists', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.name, p.created_at,
             COUNT(t.id)::int AS track_count
      FROM playlists p
      LEFT JOIN playlist_tracks t ON t.playlist_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC;
    `);
    res.json({ playlists: result.rows });
  } catch (err) {
    console.error('Ошибка БД:', err.message);
    res.status(500).json({ error: 'Ошибка базы данных' });
  }
});

// ---------- Плейлисты: создание ----------
app.post('/api/playlists', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Поле name обязательно' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO playlists (name) VALUES ($1) RETURNING *;',
      [name.trim()]
    );
    res.status(201).json({ playlist: result.rows[0] });
  } catch (err) {
    console.error('Ошибка создания плейлиста:', err.message);
    res.status(500).json({ error: 'Ошибка базы данных' });
  }
});

// ---------- Плейлисты: удаление (каскадно удалит треки) ----------
app.delete('/api/playlists/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Некорректный id' });

  try {
    const result = await pool.query(
      'DELETE FROM playlists WHERE id = $1 RETURNING id;',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }
    res.json({ status: 'deleted', id });
  } catch (err) {
    console.error('Ошибка удаления плейлиста:', err.message);
    res.status(500).json({ error: 'Ошибка базы данных' });
  }
});

// ---------- Треки плейлиста: список ----------
app.get('/api/playlists/:id/tracks', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Некорректный id' });

  try {
    const result = await pool.query(
      'SELECT * FROM playlist_tracks WHERE playlist_id = $1 ORDER BY added_at ASC;',
      [id]
    );
    res.json({ tracks: result.rows });
  } catch (err) {
    console.error('Ошибка БД:', err.message);
    res.status(500).json({ error: 'Ошибка базы данных' });
  }
});

// ---------- Треки плейлиста: добавление ----------
app.post('/api/playlists/:id/tracks', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Некорректный id' });

  const { title, artist, preview_url } = req.body;
  if (!title || !artist) {
    return res.status(400).json({ error: 'Поля title и artist обязательны' });
  }

  try {
    // Проверяем, что плейлист существует
    const pl = await pool.query('SELECT id FROM playlists WHERE id = $1;', [id]);
    if (pl.rows.length === 0) {
      return res.status(404).json({ error: 'Плейлист не найден' });
    }

    // Защита от дубля в рамках одного плейлиста
    const dup = await pool.query(
      'SELECT id FROM playlist_tracks WHERE playlist_id = $1 AND title = $2 AND artist = $3;',
      [id, title, artist]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'Этот трек уже есть в плейлисте' });
    }

    const result = await pool.query(
      `INSERT INTO playlist_tracks (playlist_id, title, artist, preview_url)
       VALUES ($1, $2, $3, $4) RETURNING *;`,
      [id, title, artist, preview_url || null]
    );
    res.status(201).json({ track: result.rows[0] });
  } catch (err) {
    console.error('Ошибка добавления трека:', err.message);
    res.status(500).json({ error: 'Ошибка базы данных' });
  }
});

// ---------- Треки плейлиста: удаление ----------
app.delete('/api/playlists/:id/tracks/:trackId', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const trackId = parseInt(req.params.trackId, 10);
  if (isNaN(id) || isNaN(trackId)) {
    return res.status(400).json({ error: 'Некорректные id' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM playlist_tracks WHERE id = $1 AND playlist_id = $2 RETURNING id;',
      [trackId, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Трек не найден в этом плейлисте' });
    }
    res.json({ status: 'deleted', id: trackId });
  } catch (err) {
    console.error('Ошибка удаления трека:', err.message);
    res.status(500).json({ error: 'Ошибка базы данных' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend запущен на порту ${PORT}`);
});