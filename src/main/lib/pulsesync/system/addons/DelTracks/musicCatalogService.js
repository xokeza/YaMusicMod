// Music Catalog Service for DelTracks (Node / Browser compatible helpers)
// Queries iTunes/Apple Music Search API, Deezer API, and SoundCloud/YouTube search
// to discover deleted/missing tracks for any given album or artist.

class MusicCatalogService {
    static normalizeStr(s) {
        return String(s || "")
            .toLowerCase()
            .replace(/[ё]/g, "е")
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    /**
     * Search missing album tracks from public catalog APIs (Deezer / iTunes)
     * @param {string} artist 
     * @param {string} album 
     * @returns {Promise<Array>} List of tracks from complete album
     */
    static async fetchFullAlbum(artist, album) {
        if (!artist && !album) return [];
        const normArtist = this.normalizeStr(artist);
        const normAlbum = this.normalizeStr(album);

        // 1. Try iTunes Search API
        try {
            const query = encodeURIComponent(`${artist} ${album}`);
            const itunesUrl = `https://itunes.apple.com/search?term=${query}&entity=album&limit=5`;
            const res = await fetch(itunesUrl);
            if (res.ok) {
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    // Match best album
                    const matchedAlbum = data.results.find((a) => {
                        const aArtist = this.normalizeStr(a.artistName);
                        const aAlbum = this.normalizeStr(a.collectionName);
                        return (aArtist.includes(normArtist) || normArtist.includes(aArtist)) &&
                               (aAlbum.includes(normAlbum) || normAlbum.includes(aAlbum));
                    }) || data.results[0];

                    if (matchedAlbum?.collectionId) {
                        // Fetch tracks of this collection
                        const lookupUrl = `https://itunes.apple.com/lookup?id=${matchedAlbum.collectionId}&entity=song`;
                        const lRes = await fetch(lookupUrl);
                        if (lRes.ok) {
                            const lData = await lRes.json();
                            const songResults = lData.results.filter((r) => r.wrapperType === "track");
                            if (songResults.length > 0) {
                                return songResults.map((s) => ({
                                    id: `deltracks-itunes-${s.trackId}`,
                                    source: "itunes",
                                    title: s.trackName,
                                    artist: s.artistName,
                                    album: s.collectionName,
                                    position: s.trackNumber,
                                    duration: Math.round((s.trackTimeMillis || 0) / 1000),
                                    previewUrl: s.previewUrl,
                                    coverUri: s.artworkUrl100?.replace("100x100bb", "600x600bb") || ""
                                }));
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.debug("[DelTracks] iTunes lookup failed:", e.message);
        }

        // 2. Try Deezer Search API (via public mirror / JSONP/CORS proxy if available)
        try {
            const deezerUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(`${artist} ${album}`)}`;
            const dRes = await fetch(deezerUrl);
            if (dRes.ok) {
                const dData = await dRes.json();
                if (dData.data && dData.data.length > 0) {
                    const albumId = dData.data[0].id;
                    const tracksRes = await fetch(`https://api.deezer.com/album/${albumId}/tracks`);
                    if (tracksRes.ok) {
                        const tracksData = await tracksRes.json();
                        if (tracksData.data && tracksData.data.length > 0) {
                            return tracksData.data.map((t, idx) => ({
                                id: `deltracks-deezer-${t.id}`,
                                source: "deezer",
                                title: t.title,
                                artist: t.artist?.name || artist,
                                album: album,
                                position: t.track_position || idx + 1,
                                duration: t.duration || 180,
                                previewUrl: t.preview,
                                coverUri: dData.data[0].cover_big || dData.data[0].cover_medium || ""
                            }));
                        }
                    }
                }
            }
        } catch (e) {
            console.debug("[DelTracks] Deezer lookup failed:", e.message);
        }

        return [];
    }

    /**
     * Resolves playable audio stream URL for a track title + artist
     */
    static async resolveAudioStream(artist, title) {
        // First check soundcloud / youtube mirror
        try {
            const query = encodeURIComponent(`${artist} - ${title}`);
            // Check free audio search API
            const piperRes = await fetch(`https://pipedapi.kavin.rocks/search?q=${query}&filter=music_songs`);
            if (piperRes.ok) {
                const results = await piperRes.json();
                if (results?.items?.length > 0) {
                    const videoId = results.items[0].url?.replace("/watch?v=", "");
                    if (videoId) {
                        const streamRes = await fetch(`https://pipedapi.kavin.rocks/streams/${videoId}`);
                        if (streamRes.ok) {
                            const streamData = await streamRes.json();
                            const audioStream = streamData.audioStreams?.find((s) => s.mimeType?.includes("audio/webm") || s.mimeType?.includes("audio/mp4"));
                            if (audioStream?.url) return audioStream.url;
                        }
                    }
                }
            }
        } catch (e) {
            console.debug("[DelTracks] Stream resolution fallback:", e.message);
        }
        return null;
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { MusicCatalogService };
}
