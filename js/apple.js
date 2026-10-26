// Apple Music via MusicKit JS v3. Songs play inside this tab; the visuals hear them
// through "Tab or system audio" capture (choose this tab when the browser asks).
// Needs an Apple Music developer token (see scripts/apple-token.mjs) and an Apple Music subscription.
(function () {
  const store = window.VizSpotify.store;
  const Apple = {
    music: null,
    get token() { return store.get('appleToken') || (window.Y2KVIZ_CONFIG && window.Y2KVIZ_CONFIG.appleDeveloperToken) || ''; },
    get connected() { return !!(this.music && this.music.isAuthorized); },

    _load() {
      if (window.MusicKit) return Promise.resolve();
      return new Promise((res, rej) => {
        document.addEventListener('musickitloaded', () => res(), { once: true });
        const s = document.createElement('script');
        s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
        s.onerror = () => rej(new Error('Could not load MusicKit. Check your connection.'));
        document.head.appendChild(s);
      });
    },

    async connect(onChange) {
      if (!this.token) throw new Error('Add your Apple Music developer token in Settings first.');
      await this._load();
      await MusicKit.configure({ developerToken: this.token, app: { name: 'xVIZ', build: '1.0.0' } });
      this.music = MusicKit.getInstance();
      await this.music.authorize();
      ['nowPlayingItemDidChange', 'playbackStateDidChange'].forEach(e => this.music.addEventListener(e, onChange));
      return true;
    },

    get state() {
      const m = this.music, it = m && m.nowPlayingItem;
      if (!it) return null;
      return {
        title: it.title, artist: it.artistName,
        art: it.artwork ? MusicKit.formatArtworkURL(it.artwork, 300, 300) : '',
        playing: m.playbackState === MusicKit.PlaybackStates.playing,
        progress: m.currentPlaybackDuration ? m.currentPlaybackTime / m.currentPlaybackDuration : 0,
        seconds: m.currentPlaybackTime,
      };
    },

    async search(term) {
      const r = await this.music.api.music(`/v1/catalog/${this.music.storefrontId}/search`, { term, types: 'songs', limit: 8 });
      return ((r.data.results.songs || {}).data || []).map(s => ({
        id: s.id, title: s.attributes.name, artist: s.attributes.artistName,
        art: s.attributes.artwork ? MusicKit.formatArtworkURL(s.attributes.artwork, 68, 68) : '',
      }));
    },
    async playSong(id) { await this.music.setQueue({ song: id, startPlaying: true }); },

    play() { return this.music.play(); },
    pause() { return this.music.pause(); },
    next() { return this.music.skipToNextItem(); },
    prev() { return this.music.skipToPreviousItem(); },
    seek(frac) { return this.music.seekToTime(frac * this.music.currentPlaybackDuration); },
    async logout() { if (this.music) await this.music.unauthorize(); },
  };
  window.VizApple = Apple;
})();
