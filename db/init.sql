-- Плейлисты (контейнеры)
CREATE TABLE IF NOT EXISTS playlists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Треки внутри плейлистов
CREATE TABLE IF NOT EXISTS playlist_tracks (
    id SERIAL PRIMARY KEY,
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    preview_url TEXT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id
    ON playlist_tracks(playlist_id);

-- Начальные данные: два плейлиста с треками
INSERT INTO playlists (name) VALUES
('Классика рока'),
('Для тренировки');

INSERT INTO playlist_tracks (playlist_id, title, artist) VALUES
(1, 'Bohemian Rhapsody', 'Queen'),
(1, 'Smells Like Teen Spirit', 'Nirvana'),
(1, 'Billie Jean', 'Michael Jackson'),
(2, 'Eye of the Tiger', 'Survivor'),
(2, 'Stronger', 'Kanye West');