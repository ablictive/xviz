// Spotify: Authorization Code + PKCE (no server, no client secret).
// Gives now-playing metadata and remote control of the user's active Spotify device.
// Playback control (play/pause/skip) needs Spotify Premium; reading now-playing works on any plan.
(function () {
  const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
  const store = {
    get(k) { try { return localStorage.getItem('y2kviz.' + k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem('y2kviz.' + k) : localStorage.setItem('y2kviz.' + k, v); } catch {} },
  };
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const Spotify = {
    store,
    get clientId() { return store.get('spotifyClientId') || (window.Y2KVIZ_CONFIG && window.Y2KVIZ_CONFIG.spotifyClientId) || ''; },
    get redirectUri() { return location.origin + location.pathname; },
    get connected() { return !!store.get('spotifyRefresh'); },
    state: null, // last now-playing payload

    async login() {
      if (!this.clientId) throw new Error('Add your Spotify Client ID in Settings first.');
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
      const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      store.set('spotifyVerifier', verifier);
      const q = new URLSearchParams({ response_type: 'code', client_id: this.clientId, scope: SCOPES, code_challenge_method: 'S256', code_challenge: challenge, redirect_uri: this.redirectUri, state: 'spotify' });
      location.href = 'https://accounts.spotify.com/authorize?' + q;
    },

    // Call on page load: finishes the redirect back from Spotify.
    async handleRedirect() {
      const q = new URLSearchParams(location.search);
      if (q.get('state') !== 'spotify') return false;
      history.replaceState(null, '', location.pathname);
      if (q.get('error')) throw new Error('Spotify sign-in was cancelled.');
      const body = new URLSearchParams({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: this.redirectUri, client_id: this.clientId, code_verifier: store.get('spotifyVerifier') || '' });
      await this._token(body);
      store.set('spotifyVerifier', null);
      return true;
    },

    async _token(body) {
      const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const j = await r.json();
      if (!r.ok) { if (j.error === 'invalid_grant') this.logout(); throw new Error('Spotify sign-in failed: ' + (j.error_description || j.error)); }
      store.set('spotifyAccess', j.access_token);
      store.set('spotifyExpires', String(Date.now() + (j.expires_in - 60) * 1000));
      if (j.refresh_token) store.set('spotifyRefresh', j.refresh_token);
    },

    async _access() {
      if (Date.now() > Number(store.get('spotifyExpires') || 0)) {
        await this._token(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: store.get('spotifyRefresh'), client_id: this.clientId }));
      }
      return store.get('spotifyAccess');
    },

    async api(path, method = 'GET') {
      const r = await fetch('https://api.spotify.com/v1' + path, { method, headers: { Authorization: 'Bearer ' + await this._access() } });
      if (r.status === 204) return null;
      if (r.status === 403 && method !== 'GET') throw new Error('Spotify only allows playback control with Premium.');
      if (r.status === 404 && method !== 'GET') throw new Error('Open Spotify on any device and start a song, then try again.');
      if (!r.ok) throw new Error('Spotify returned ' + r.status);
      const text = await r.text();
      return text ? JSON.parse(text) : null;
    },

    async poll() {
      const j = await this.api('/me/player/currently-playing?additional_types=episode');
      if (!j || !j.item) { this.state = null; return null; }
      const it = j.item;
      this.state = {
        title: it.name,
        artist: it.artists ? it.artists.map(a => a.name).join(', ') : (it.show && it.show.name) || '',
        art: ((it.album && it.album.images) || it.images || [])[0]?.url || '',
        playing: j.is_playing,
        progress: it.duration_ms ? j.progress_ms / it.duration_ms : 0,
        seconds: j.progress_ms / 1000,
        duration: it.duration_ms,
      };
      return this.state;
    },

    play() { return this.api('/me/player/play', 'PUT'); },
    pause() { return this.api('/me/player/pause', 'PUT'); },
    next() { return this.api('/me/player/next', 'POST'); },
    prev() { return this.api('/me/player/previous', 'POST'); },
    seek(frac) { if (!this.state) return; return this.api('/me/player/seek?position_ms=' + Math.round(frac * this.state.duration), 'PUT'); },
    logout() { ['spotifyAccess', 'spotifyRefresh', 'spotifyExpires'].forEach(k => store.set(k, null)); this.state = null; },
  };

  window.VizSpotify = Spotify;
})();
