/* GlassTube — YouTube for Meta Ray-Ban Display glasses
   600x600 viewport · D-pad input (arrows / Enter / Escape / Backspace) · black = transparent */
(function () {
  "use strict";

  var VERSION = "1.0.0";
  var CFG = window.GT_CONFIG || {};
  var SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
  var TOKEN_URL = "https://oauth2.googleapis.com/token";
  var API = "https://www.googleapis.com/youtube/v3/";
  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");

  /* ---------------- storage ---------------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("gt." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("gt." + k, JSON.stringify(v)); } catch (e) { pruneCache(); try { localStorage.setItem("gt." + k, JSON.stringify(v)); } catch (e2) {} } },
    del: function (k) { try { localStorage.removeItem("gt." + k); } catch (e) {} }
  };
  function pruneCache() {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf("gt.c.") === 0) localStorage.removeItem(k); }); } catch (e) {}
  }
  var settings = Object.assign({ hideShorts: true, sponsorBlock: true, hideWatched: false, region: CFG.REGION || "GB" }, store.get("settings", {}));
  function saveSettings() { store.set("settings", settings); }
  var hist = store.get("hist", {});
  function saveHist() {
    var ids = Object.keys(hist);
    if (ids.length > 200) {
      ids.sort(function (a, b) { return hist[b].at - hist[a].at; }).slice(200).forEach(function (id) { delete hist[id]; });
    }
    store.set("hist", hist);
  }
  var recents = store.get("recents", []);
  var avatars = store.get("avatars", {});

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function parseDur(iso) {
    var m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
    if (!m) return 0;
    return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
  }
  function fmtNum(n) {
    n = +n || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(n < 1e10 ? 1 : 0).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, "") + "K";
    return String(n);
  }
  function ago(t) {
    if (!t) return "";
    var s = (Date.now() - t) / 1000;
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    if (s < 604800) return Math.floor(s / 86400) + "d ago";
    if (s < 2629800) return Math.floor(s / 604800) + "w ago";
    if (s < 31557600) return Math.floor(s / 2629800) + "mo ago";
    return Math.floor(s / 31557600) + "y ago";
  }
  function thumbOf(th, prefer) {
    th = th || {};
    for (var i = 0; i < prefer.length; i++) if (th[prefer[i]]) return th[prefer[i]].url;
    return "";
  }
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, 2600);
  }
  function isShort(v) { return v.duration > 0 && (v.duration <= 60 || (v.duration <= 180 && /#shorts?\b/i.test(v.title + " " + (v.desc || "")))); }
  function progressOf(v) { var h = hist[v.id]; return h && h.d ? clamp(h.p / h.d, 0, 1) : 0; }

  /* ---------------- icons (inline SVG is fine in-page) ---------------- */
  var I = {
    home: '<svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/></svg>',
    subs: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M6 3h12" /><path class="f" d="M10 9.5v6l5-3z"/></svg>',
    chan: '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="8" r="2.6"/><path d="M17.5 13.6c2.2.3 3.6 1.9 4 4.4"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path class="f" d="M8 5.5v13l10.5-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path class="f" d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/></svg>',
    rew: '<svg viewBox="0 0 24 24"><path d="M5.2 8.2A8 8 0 1 1 4 12.5"/><path d="M4.5 3.8v4.7h4.7"/><text x="12.6" y="15.6" text-anchor="middle">15</text></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M18.8 8.2A8 8 0 1 0 20 12.5"/><path d="M19.5 3.8v4.7h-4.7"/><text x="11.4" y="15.6" text-anchor="middle">15</text></svg>',
    restart: '<svg viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M5 3.5V8h4.5"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M4 7h11M4 12h11M4 17h7"/><path class="f" d="M16 14v6l4.5-3z"/></svg>'
  };
  var LOGO = '<svg class="logo" viewBox="0 0 64 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#ff4d6d"/><stop offset="1" stop-color="#ff9a5a"/></linearGradient></defs>' +
    '<rect x="2" y="5" width="25" height="21" rx="9" fill="none" stroke="#fff" stroke-width="3"/>' +
    '<path d="M27 13c2-2.2 8-2.2 10 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
    '<rect x="37" y="5" width="25" height="21" rx="9" fill="url(#lg)"/><path d="M46 10.5v10l8-5z" fill="#000"/></svg>';

  /* ---------------- auth (Google OAuth device flow) ---------------- */
  var auth = store.get("auth", null);
  var mode = store.get("mode", null); // "user" | "guest" | "demo"
  var me = store.get("me", null);

  function form(o) { return { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() }; }
  function deviceStart() {
    return fetch("https://oauth2.googleapis.com/device/code", form({ client_id: CFG.CLIENT_ID, scope: SCOPE }))
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error_description || j.error || "Couldn't start sign-in"); return j; }); });
  }
  function devicePoll(code) {
    return fetch(TOKEN_URL, form({ client_id: CFG.CLIENT_ID, client_secret: CFG.CLIENT_SECRET, device_code: code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }))
      .then(function (r) { return r.json(); });
  }
  function saveTokens(j) {
    auth = { access_token: j.access_token, expires_at: Date.now() + (j.expires_in - 60) * 1000, refresh_token: j.refresh_token || (auth && auth.refresh_token) };
    store.set("auth", auth);
  }
  var refreshing = null;
  function getToken(force) {
    if (!auth) return Promise.resolve(null);
    if (!force && auth.access_token && Date.now() < auth.expires_at) return Promise.resolve(auth.access_token);
    if (!auth.refresh_token) return Promise.resolve(null);
    if (!refreshing) {
      refreshing = fetch(TOKEN_URL, form({ client_id: CFG.CLIENT_ID, client_secret: CFG.CLIENT_SECRET, refresh_token: auth.refresh_token, grant_type: "refresh_token" }))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          refreshing = null;
          if (!j.access_token) { signOut(true); throw new Error("Your sign-in expired — please pair again"); }
          saveTokens(j); return auth.access_token;
        }, function (e) { refreshing = null; throw e; });
    }
    return refreshing;
  }
  function signOut(silent) {
    auth = null; me = null; mode = null;
    store.del("auth"); store.del("me"); store.del("mode"); pruneCache();
    if (!silent) { stack = [mk("login")]; render(); }
  }

  /* ---------------- YouTube Data API ---------------- */
  function yt(path, params, retried) {
    var url = new URL(API + path);
    Object.keys(params).forEach(function (k) { if (params[k] != null) url.searchParams.set(k, params[k]); });
    var p = mode === "user" ? getToken() : Promise.resolve(null);
    return p.then(function (tok) {
      var headers = {};
      if (tok) headers.Authorization = "Bearer " + tok;
      else if (CFG.API_KEY) url.searchParams.set("key", CFG.API_KEY);
      return fetch(url.toString(), { headers: headers });
    }).then(function (r) {
      if (r.status === 401 && mode === "user" && !retried) return getToken(true).then(function () { return yt(path, params, true); });
      return r.json().then(function (j) {
        if (!r.ok) {
          var reason = j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
          if (reason === "quotaExceeded") throw new Error("Daily YouTube quota used up — try again tomorrow");
          throw new Error((j.error && j.error.message) || "YouTube request failed");
        }
        return j;
      });
    });
  }
  function cached(key, ttlMin, fn) {
    var c = store.get("c." + key, null);
    if (c && Date.now() - c.t < ttlMin * 60000) return Promise.resolve(c.v);
    return fn().then(function (v) { store.set("c." + key, { t: Date.now(), v: v }); return v; });
  }
  function normVideo(it) {
    var sn = it.snippet || {}, cd = it.contentDetails || {}, st = it.statistics || {};
    return {
      id: it.id, title: sn.title || "", ch: sn.channelTitle || "", chId: sn.channelId || "",
      at: sn.publishedAt ? Date.parse(sn.publishedAt) : 0, duration: parseDur(cd.duration),
      views: st.viewCount ? +st.viewCount : null, live: sn.liveBroadcastContent === "live", upcoming: sn.liveBroadcastContent === "upcoming",
      thumb: thumbOf(sn.thumbnails, ["medium", "high", "default"]),
      hero: thumbOf(sn.thumbnails, ["maxres", "standard", "high", "medium"]),
      desc: (sn.description || "").slice(0, 320)
    };
  }
  function videosByIds(ids) {
    var chunks = [];
    for (var i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    return Promise.all(chunks.map(function (c) {
      return yt("videos", { part: "snippet,contentDetails,statistics", id: c.join(","), maxResults: 50 }).then(function (j) { return (j.items || []).map(normVideo); });
    })).then(function (arrs) {
      var map = {}; [].concat.apply([], arrs).forEach(function (v) { map[v.id] = v; });
      return ids.map(function (id) { return map[id]; }).filter(Boolean);
    });
  }
  function pool(items, n, fn) {
    var out = new Array(items.length), i = 0;
    function next() { if (i >= items.length) return Promise.resolve(); var k = i++; return fn(items[k]).then(function (r) { out[k] = r; }, function () { out[k] = null; }).then(next); }
    var workers = []; for (var w = 0; w < Math.min(n, items.length); w++) workers.push(next());
    return Promise.all(workers).then(function () { return out; });
  }
  function filterShorts(vs) { return settings.hideShorts ? vs.filter(function (v) { return !isShort(v); }) : vs; }

  var Data = {
    subs: function () {
      if (mode === "demo") return Promise.resolve(DEMO.channels);
      return cached("subs", 360, function () {
        var all = [];
        function page(tok) {
          return yt("subscriptions", { part: "snippet", mine: "true", order: "unread", maxResults: 50, pageToken: tok }).then(function (j) {
            (j.items || []).forEach(function (it) {
              var sn = it.snippet;
              all.push({ id: sn.resourceId.channelId, title: sn.title, thumb: thumbOf(sn.thumbnails, ["high", "medium", "default"]) });
            });
            if (j.nextPageToken && all.length < 500) return page(j.nextPageToken);
          });
        }
        return page().then(function () {
          all.forEach(function (c) { avatars[c.id] = c.thumb; });
          store.set("avatars", avatars);
          return all;
        });
      });
    },
    feed: function () {
      if (mode === "demo") return Promise.resolve(DEMO.videos);
      return cached("feed", 15, function () {
        return Data.subs().then(function (subs) {
          var top = subs.slice(0, CFG.FEED_CHANNELS || 40);
          return pool(top, 6, function (c) {
            return yt("playlistItems", { part: "contentDetails", playlistId: "UU" + c.id.slice(2), maxResults: 6 })
              .then(function (j) { return (j.items || []).map(function (x) { return x.contentDetails.videoId; }); });
          });
        }).then(function (lists) {
          var ids = [].concat.apply([], lists.filter(Boolean));
          return videosByIds(ids);
        }).then(function (vs) { return vs.sort(function (a, b) { return b.at - a.at; }); });
      });
    },
    trending: function () {
      if (mode === "demo") return Promise.resolve(DEMO.videos.slice().reverse());
      return cached("trend." + settings.region, 30, function () {
        return yt("videos", { part: "snippet,contentDetails,statistics", chart: "mostPopular", regionCode: settings.region, maxResults: 30 }).then(function (j) { return (j.items || []).map(normVideo); });
      });
    },
    liked: function () {
      if (mode !== "user") return Promise.resolve([]);
      return cached("liked", 30, function () {
        return yt("videos", { part: "snippet,contentDetails,statistics", myRating: "like", maxResults: 30 }).then(function (j) { return (j.items || []).map(normVideo); });
      });
    },
    playlists: function (channelId) {
      if (mode === "demo") return Promise.resolve([]);
      if (!channelId && mode !== "user") return Promise.resolve([]);
      return cached("pls." + (channelId || "mine"), 60, function () {
        var p = { part: "snippet,contentDetails", maxResults: 30 };
        if (channelId) p.channelId = channelId; else p.mine = "true";
        return yt("playlists", p).then(function (j) {
          return (j.items || []).filter(function (x) { return x.contentDetails.itemCount > 0; }).map(function (x) {
            return { id: x.id, title: x.snippet.title, count: x.contentDetails.itemCount, thumb: thumbOf(x.snippet.thumbnails, ["medium", "high", "default"]), hero: thumbOf(x.snippet.thumbnails, ["maxres", "standard", "high", "medium"]), ch: x.snippet.channelTitle };
          });
        });
      });
    },
    playlist: function (id) {
      return cached("pl." + id, 30, function () {
        return yt("playlistItems", { part: "contentDetails", playlistId: id, maxResults: 50 }).then(function (j) {
          return videosByIds((j.items || []).map(function (x) { return x.contentDetails.videoId; }));
        });
      });
    },
    channel: function (id) {
      if (mode === "demo") {
        var c = DEMO.channels.filter(function (x) { return x.id === id; })[0] || DEMO.channels[0];
        return Promise.resolve({ info: { id: c.id, title: c.title, thumb: c.thumb, subs: 1840000, count: DEMO.videos.length }, videos: DEMO.videos, playlists: [] });
      }
      return cached("ch." + id, 30, function () {
        return yt("channels", { part: "snippet,statistics,contentDetails,brandingSettings", id: id }).then(function (j) {
          var c = (j.items || [])[0]; if (!c) throw new Error("Channel not found");
          var info = {
            id: id, title: c.snippet.title, thumb: thumbOf(c.snippet.thumbnails, ["high", "medium", "default"]),
            banner: c.brandingSettings && c.brandingSettings.image && c.brandingSettings.image.bannerExternalUrl ? c.brandingSettings.image.bannerExternalUrl + "=w1280-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj" : "",
            subs: c.statistics.hiddenSubscriberCount ? null : +c.statistics.subscriberCount, count: +c.statistics.videoCount
          };
          avatars[id] = info.thumb; store.set("avatars", avatars);
          var uploads = c.contentDetails.relatedPlaylists.uploads;
          return Promise.all([
            yt("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: 40 }).then(function (j2) { return videosByIds((j2.items || []).map(function (x) { return x.contentDetails.videoId; })); }),
            Data.playlists(id).catch(function () { return []; })
          ]).then(function (r) { return { info: info, videos: r[0], playlists: r[1] }; });
        });
      });
    },
    search: function (q) {
      if (mode === "demo") {
        var ql = q.toLowerCase();
        return Promise.resolve({ videos: DEMO.videos.filter(function (v) { return (v.title + v.ch).toLowerCase().indexOf(ql) > -1; }), channels: [] });
      }
      return cached("s." + q.toLowerCase(), 60, function () {
        return yt("search", { part: "snippet", q: q, maxResults: 25, type: "video,channel", safeSearch: "none" }).then(function (j) {
          var ids = [], chans = [];
          (j.items || []).forEach(function (x) {
            if (x.id.kind === "youtube#video") ids.push(x.id.videoId);
            else if (x.id.kind === "youtube#channel") chans.push({ id: x.id.channelId, title: x.snippet.title, thumb: thumbOf(x.snippet.thumbnails, ["high", "medium", "default"]) });
          });
          return videosByIds(ids).then(function (vs) { return { videos: vs, channels: chans }; });
        });
      });
    },
    me: function () {
      if (mode !== "user") return Promise.resolve(null);
      return yt("channels", { part: "snippet", mine: "true" }).then(function (j) {
        var c = (j.items || [])[0];
        me = c ? { title: c.snippet.title, thumb: thumbOf(c.snippet.thumbnails, ["medium", "default"]) } : { title: "Signed in", thumb: "" };
        store.set("me", me); return me;
      });
    }
  };

  /* ---------------- demo content (no setup needed) ---------------- */
  function dv(id, title, dur, daysAgo, views) {
    return { id: id, title: title, ch: "Blender Studio", chId: "demo-blender", at: Date.now() - daysAgo * 86400000, duration: dur, views: views,
      thumb: "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg", hero: "https://i.ytimg.com/vi/" + id + "/maxresdefault.jpg",
      desc: "Open movie from the Blender Studio — included so you can try GlassTube before connecting your YouTube account." };
  }
  var DEMO = {
    videos: [
      dv("aqz-KE-bpKQ", "Big Buck Bunny — Blender Open Movie", 635, 0.2, 18000000),
      dv("eRsGyueVLvQ", "Sintel — Open Movie by Blender Foundation", 888, 1.4, 9000000),
      dv("R6MlUcmOul8", "Tears of Steel — Blender Open Movie", 734, 3, 6000000),
      dv("Y-rmzh0PI3c", "Cosmos Laundromat — First Cycle", 730, 9, 4000000),
      dv("mN0zPOpADL4", "Agent 327: Operation Barbershop", 233, 20, 12000000),
      dv("WhWc3b3KhnY", "Spring — Blender Open Movie", 464, 40, 5000000)
    ],
    channels: [{ id: "demo-blender", title: "Blender Studio", thumb: "https://i.ytimg.com/vi/aqz-KE-bpKQ/mqdefault.jpg" }]
  };

  /* ---------------- screen stack + render ---------------- */
  var stack = [];
  var mounted = null; // {s, el}
  function mk(type, params) { return { type: type, params: params || {}, nav: null, reg: [] }; }
  function top() { return stack[stack.length - 1]; }
  function push(type, params) { stack.push(mk(type, params)); guard(); render(); }
  function goRoot(type) { stack = [mk(type)]; render(); }
  function back() {
    var s = top(), def = S[s.type];
    if (def.onBack && def.onBack(s)) return;
    if (stack.length > 1) { stack.pop(); render(); }
    else if (s.type !== "home" && s.type !== "login" && s.type !== "pair") goRoot("home");
    else if (s.type === "pair") goRoot("login");
  }
  function refresh(s) { if (top() === s) render(true); }
  function render(keep) {
    var s = top(), def = S[s.type];
    if (mounted && mounted.s !== s && S[mounted.s.type].unmount) S[mounted.s.type].unmount(mounted.s);
    if (mounted && mounted.s === s && !keep) { /* full re-render of same screen */ }
    if (!s.started) { s.started = true; if (def.init) def.init(s); }
    s.reg = [];
    app.innerHTML = def.html(s);
    var el = app.firstElementChild;
    mounted = { s: s, el: el };
    if (def.mount) def.mount(s, el);
    Nav.attach(s, el);
  }
  function reg(s, obj) { s.reg.push(obj); return s.reg.length - 1; }
  function load(s, key, fn) {
    s.loading = (s.loading || 0) + 1;
    return fn().then(function (v) { s[key] = v; s.error = null; }, function (e) { s.error = e.message || String(e); })
      .then(function () { s.loading--; refresh(s); });
  }

  /* ---------------- focus navigation ---------------- */
  var Nav = {
    s: null, el: null, rows: [],
    attach: function (s, el) {
      this.s = s; this.el = el;
      var map = {};
      el.querySelectorAll("[data-r]").forEach(function (e) { var r = +e.dataset.r; (map[r] = map[r] || []).push(e); });
      this.rows = Object.keys(map).map(Number).sort(function (a, b) { return a - b; }).map(function (k) {
        return map[k].sort(function (a, b) { return (+a.dataset.c || 0) - (+b.dataset.c || 0); });
      });
      if (!s.nav || s.nav.auto) {
        var d = S[s.type].defaultFocus ? S[s.type].defaultFocus(s, this.rows) : [Math.min(1, this.rows.length - 1), 0];
        s.nav = { ri: d[0], ci: d[1], mem: {}, auto: true };
      }
      this.focus(true);
    },
    cur: function () { var r = this.rows[this.s.nav.ri]; return r ? r[this.s.nav.ci] : null; },
    focus: function (instant) {
      if (!this.rows.length) return;
      var n = this.s.nav;
      n.ri = clamp(n.ri, 0, this.rows.length - 1);
      n.ci = clamp(n.ci, 0, this.rows[n.ri].length - 1);
      n.mem[n.ri] = n.ci;
      var el = this.cur();
      this.el.querySelectorAll(".focused").forEach(function (e) { e.classList.remove("focused"); });
      el.classList.add("focused");
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
      this.scroll(el, instant);
      var def = S[this.s.type];
      if (def.onFocus) def.onFocus(this.s, el, this.el);
    },
    scroll: function (el, instant) {
      var track = el.closest(".track");
      if (track) {
        var W = track.parentElement.clientWidth, max = Math.max(0, track.scrollWidth - W);
        var x = clamp(el.offsetLeft - 24, 0, max);
        if (instant) track.style.transition = "none";
        track.style.transform = "translateX(" + -x + "px)";
        if (instant) { void track.offsetWidth; track.style.transition = ""; }
      }
      var vs = el.closest(".vscroll");
      if (vs) {
        var box = el.closest("[data-rowbox]") || el, t = 0, n = box;
        while (n && n !== vs) { t += n.offsetTop; n = n.offsetParent; }
        var H = vs.parentElement.clientHeight, maxY = Math.max(0, vs.scrollHeight - H);
        var y = clamp(t - (+vs.dataset.pad || 0), 0, maxY);
        if (instant) vs.style.transition = "none";
        vs.style.transform = "translateY(" + -y + "px)";
        if (instant) { void vs.offsetWidth; vs.style.transition = ""; }
      }
    },
    move: function (dir) {
      var n = this.s.nav, row = this.rows[n.ri];
      if (!row) return;
      n.auto = false;
      if (dir === "left" || dir === "right") {
        var ci = n.ci + (dir === "left" ? -1 : 1);
        if (ci < 0 || ci >= row.length) return;
        n.ci = ci;
      } else {
        var ri = n.ri + (dir === "up" ? -1 : 1);
        if (ri < 0 || ri >= this.rows.length) return;
        var target = this.rows[ri], from = this.cur();
        var onTab = target.filter(function (e) { return e.classList.contains("on"); })[0];
        if (onTab && dir === "up") n.ci = target.indexOf(onTab);
        else if (target[0].closest(".track") && n.mem[ri] != null) n.ci = n.mem[ri];
        else {
          var fx = from.getBoundingClientRect(), cx = fx.left + fx.width / 2, best = 0, bd = 1e9;
          target.forEach(function (e, i) { var b = e.getBoundingClientRect(), d = Math.abs(b.left + b.width / 2 - cx); if (d < bd) { bd = d; best = i; } });
          n.ci = target[0].closest(".track") ? (n.mem[ri] || 0) : best;
        }
        n.ri = ri;
      }
      this.focus();
    }
  };

  /* ---------------- input ---------------- */
  var KEYMAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  document.addEventListener("keydown", function (e) {
    var s = top(), def = S[s.type], k = e.key;
    var inInput = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (def.onKey && def.onKey(s, k, e)) { e.preventDefault(); return; }
    if (KEYMAP[k]) { e.preventDefault(); Nav.move(KEYMAP[k]); return; }
    if (k === "Enter" || k === " ") {
      if (inInput) return; // let the glasses composer open
      e.preventDefault(); activate(Nav.cur()); return;
    }
    if (k === "Escape" || k === "Backspace" || k === "GoBack" || k === "BrowserBack") {
      if (inInput && k === "Backspace" && e.target.value) return;
      e.preventDefault(); back();
    }
  });
  // Pointer/tap fallback (desktop testing, touchpad tap)
  app.addEventListener("click", function (e) {
    var t = e.target.closest("[data-r]");
    if (!t) return;
    var n = Nav.s.nav;
    Nav.rows.forEach(function (row, ri) { var ci = row.indexOf(t); if (ci > -1) { n.ri = ri; n.ci = ci; } });
    n.auto = false; Nav.focus();
    if (t.tagName !== "INPUT") activate(t);
  });
  // History guard so the system back gesture moves back inside the app (max 5 entries on glasses)
  var guarded = false;
  function guard() { if (!guarded) { try { history.pushState({ gt: 1 }, ""); guarded = true; } catch (e) {} } }
  window.addEventListener("popstate", function () {
    guarded = false;
    if (stack.length > 1 || (top().type !== "home" && top().type !== "login")) { back(); guard(); }
  });
  // If the video iframe grabs focus, take it back so the D-pad keeps working
  window.addEventListener("blur", function () { setTimeout(function () { var c = Nav.cur(); if (c && document.activeElement !== c) try { window.focus(); c.focus({ preventScroll: true }); } catch (e) {} }, 60); });

  function activate(el) {
    if (!el) return;
    var s = top(), act = el.dataset.act, item = el.dataset.i != null ? s.reg[+el.dataset.i] : null;
    if (act === "tab") { if (el.dataset.tab !== s.type || stack.length > 1) goRoot(el.dataset.tab); return; }
    if (act === "back") { back(); return; }
    if (act === "item" && item) { openItem(item); return; }
    var def = S[s.type];
    if (def.act) def.act(s, act, el, item);
  }
  function openItem(item) {
    if (item.kind === "video") push("detail", { v: item.v });
    else if (item.kind === "channel") push("channel", { id: item.c.id, title: item.c.title, thumb: item.c.thumb });
    else if (item.kind === "playlist") push("playlist", { p: item.p });
    else if (item.kind === "query") push("results", { q: item.q });
  }

  /* ---------------- shared UI pieces ---------------- */
  var TABS = [["home", "Home", I.home], ["subs", "Subscriptions", I.subs], ["channels", "Channels", I.chan], ["search", "Search", I.search], ["settings", "Settings", I.gear]];
  function topbar(s, title, extra) {
    var isRoot = stack.length === 1 && TABS.some(function (t) { return t[0] === s.type; });
    if (isRoot) {
      return '<header class="topbar">' + LOGO + '<nav class="tabs">' + TABS.map(function (t, c) {
        return '<button class="tab' + (t[0] === s.type ? " on" : "") + '" data-r="0" data-c="' + c + '" data-act="tab" data-tab="' + t[0] + '" aria-label="' + t[1] + '">' + t[2] + '<span>' + t[1] + "</span></button>";
      }).join("") + "</nav></header>";
    }
    return '<header class="topbar sub"><button class="backbtn" data-r="0" data-c="0" data-act="back" aria-label="Back">' + I.back + "</button>" +
      (extra || "") + '<h1 class="ttl">' + esc(title || "") + "</h1></header>";
  }
  function videoCard(s, v, r, c) {
    var i = reg(s, { kind: "video", v: v }), p = progressOf(v), w = p > 0.92;
    return '<div class="card v' + (w ? " watched" : "") + '" tabindex="-1" data-r="' + r + '" data-c="' + c + '" data-i="' + i + '" data-act="item">' +
      '<img src="' + esc(v.thumb) + '" alt="" loading="lazy">' +
      (v.live ? '<b class="badge live">LIVE</b>' : v.upcoming ? '<b class="badge">SOON</b>' : v.duration ? '<b class="badge">' + fmtTime(v.duration) + "</b>" : "") +
      (p > 0.01 ? '<i class="prog"><i style="width:' + (p * 100).toFixed(1) + '%"></i></i>' : "") + "</div>";
  }
  function chanCard(s, c, r, col) {
    var i = reg(s, { kind: "channel", c: c });
    return '<div class="card ch" tabindex="-1" data-r="' + r + '" data-c="' + col + '" data-i="' + i + '" data-act="item"><img src="' + esc(c.thumb) + '" alt="" loading="lazy"><span>' + esc(c.title) + "</span></div>";
  }
  function plCard(s, p, r, c) {
    var i = reg(s, { kind: "playlist", p: p });
    return '<div class="card pl" tabindex="-1" data-r="' + r + '" data-c="' + c + '" data-i="' + i + '" data-act="item"><img src="' + esc(p.thumb) + '" alt="" loading="lazy">' +
      '<div class="pl-side">' + I.list + "<b>" + p.count + '</b></div><span>' + esc(p.title) + "</span></div>";
  }
  function chipCard(s, q, r, c) {
    var i = reg(s, { kind: "query", q: q });
    return '<button class="chip" data-r="' + r + '" data-c="' + c + '" data-i="' + i + '" data-act="item">' + esc(q) + "</button>";
  }
  function shelvesHTML(s, shelves, startRow) {
    var r = startRow;
    return shelves.filter(function (sh) { return sh.items && sh.items.length; }).map(function (sh) {
      var row = r++, maker = { video: videoCard, channel: chanCard, playlist: plCard, chip: chipCard }[sh.kind];
      return '<section class="shelf k-' + sh.kind + '" data-rowbox><h3>' + esc(sh.title) + (sh.kind !== "chip" ? "<em>" + sh.items.length + "</em>" : "") + "</h3>" +
        '<div class="track-vp"><div class="track">' + sh.items.map(function (it, c) { return maker(s, it, row, c); }).join("") + "</div></div></section>";
    }).join("");
  }
  function skeleton() {
    var cards = "<div class='sk'></div><div class='sk'></div><div class='sk'></div>";
    return '<section class="shelf"><h3 class="skt"></h3><div class="track-vp"><div class="track">' + cards + '</div></div></section><section class="shelf"><h3 class="skt"></h3><div class="track-vp"><div class="track">' + cards + "</div></div></section>";
  }
  function stateMsg(s, emptyText) {
    if (s.loading) return skeleton();
    if (s.error) return '<div class="msg" data-rowbox><p>' + esc(s.error) + '</p><button class="btn" data-r="1" data-c="0" data-act="retry">Try again</button></div>';
    return '<div class="msg" data-rowbox><p>' + esc(emptyText || "Nothing here yet") + "</p></div>";
  }

  /* Hero: crossfading backdrop + details of whatever is focused */
  function heroHTML() {
    return '<div class="hero"><img class="hb" alt=""><img class="hb" alt=""><div class="shade"></div><div class="hinfo"></div></div>';
  }
  function setHero(root, item) {
    if (!item) return;
    var hero = root.querySelector(".hero"); if (!hero) return;
    var key = item.kind + ":" + (item.v ? item.v.id : item.c ? item.c.id : item.p ? item.p.id : item.q);
    if (hero.dataset.key === key) return;
    hero.dataset.key = key;
    var info = hero.querySelector(".hinfo"), src = "", fallback = "", html = "";
    hero.classList.toggle("round", item.kind === "channel");
    if (item.kind === "video") {
      var v = item.v, p = progressOf(v), av = avatars[v.chId];
      src = v.hero || v.thumb; fallback = v.thumb;
      var meta = [v.views != null ? fmtNum(v.views) + " views" : "", v.live ? '<b class="live-t">● LIVE</b>' : ago(v.at), v.duration && !v.live ? fmtTime(v.duration) : ""].filter(Boolean).join('<i class="dot"></i>');
      html = '<div class="hch">' + (av ? '<img src="' + esc(av) + '" alt="">' : "") + "<span>" + esc(v.ch) + "</span></div>" +
        '<h2 class="htitle">' + esc(v.title) + '</h2><div class="hmeta">' + meta + "</div>" +
        (p > 0.01 && p < 0.92 ? '<div class="hprog"><i style="width:' + (p * 100).toFixed(1) + '%"></i></div>' : p >= 0.92 ? '<div class="hmeta watched-t">✓ Watched</div>' : "");
    } else if (item.kind === "channel") {
      src = item.c.thumb;
      html = '<h2 class="htitle">' + esc(item.c.title) + '</h2><div class="hmeta">Open channel</div>';
    } else if (item.kind === "playlist") {
      src = item.p.hero || item.p.thumb; fallback = item.p.thumb;
      html = '<div class="hch"><span>Playlist' + (item.p.ch ? " · " + esc(item.p.ch) : "") + '</span></div><h2 class="htitle">' + esc(item.p.title) + '</h2><div class="hmeta">' + item.p.count + " videos</div>";
    } else if (item.kind === "query") {
      html = '<h2 class="htitle">“' + esc(item.q) + '”</h2><div class="hmeta">Search again</div>';
    }
    info.innerHTML = html;
    var imgs = hero.querySelectorAll(".hb"), next = imgs[0].classList.contains("on") ? imgs[1] : imgs[0], prev = next === imgs[0] ? imgs[1] : imgs[0];
    if (!src) { prev.classList.remove("on"); return; }
    next.onload = function () {
      if (next.naturalWidth <= 120 && fallback && next.src !== fallback) { next.src = fallback; return; }
      next.classList.add("on"); prev.classList.remove("on");
    };
    next.onerror = function () { if (fallback && next.src !== fallback) next.src = fallback; };
    next.src = src;
  }
  function browseFocus(s, el, root) { if (el.dataset.i != null) setHero(root, s.reg[+el.dataset.i]); }
  function browseDefault(s, rows) { return [rows.length > 1 ? 1 : 0, 0]; }
  function browseHTML(s, top, shelves, empty) {
    var body = shelves && shelves.some(function (x) { return x.items && x.items.length; }) ? shelvesHTML(s, shelves, 1) : stateMsg(s, empty);
    return '<div class="scr browse">' + heroHTML() + top + '<div class="shelves-vp"><div class="vscroll">' + body + "</div></div></div>";
  }

  function continueWatching() {
    return Object.keys(hist).map(function (id) { return hist[id]; })
      .filter(function (h) { return h.v && h.d && h.p > 20 && h.p / h.d < 0.92; })
      .sort(function (a, b) { return b.at - a.at; }).slice(0, 15).map(function (h) { return h.v; });
  }
  function dayBucket(t) {
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var day = d0.getTime();
    if (t >= day) return "Today";
    if (t >= day - 86400000) return "Yesterday";
    if (t >= day - 6 * 86400000) return "This week";
    return "Earlier";
  }

  /* ---------------- screens ---------------- */
  var S = {};

  S.login = {
    html: function () {
      var r = 1, btns = '<button class="btn primary" data-r="' + r++ + '" data-c="0" data-act="signin">Sign in with Google</button>';
      if (CFG.API_KEY) btns += '<button class="btn" data-r="' + r++ + '" data-c="0" data-act="guest">Browse without signing in</button>';
      btns += '<button class="btn ghost" data-r="' + r++ + '" data-c="0" data-act="demo">Try the demo</button>';
      return '<div class="scr login"><div class="glow"></div><div class="brand">' + LOGO + '<h1>Glass<span>Tube</span></h1><p>Your subscriptions, right in your line of sight.</p></div><div class="stackbtns">' + btns + "</div></div>";
    },
    defaultFocus: function () { return [0, 0]; },
    act: function (s, a) {
      if (a === "signin") push("pair");
      else if (a === "guest") { mode = "guest"; store.set("mode", mode); goRoot("home"); }
      else if (a === "demo") { mode = "demo"; store.set("mode", mode); goRoot("home"); }
    }
  };

  S.pair = {
    init: function (s) { if (CFG.CLIENT_ID && CFG.CLIENT_SECRET) S.pair.start(s); },
    start: function (s) {
      clearTimeout(s.timer); s.code = null; s.err = null; s.status = "Getting a code…"; refresh(s);
      deviceStart().then(function (j) {
        s.code = j.user_code; s.url = (j.verification_url || "google.com/device").replace(/^https?:\/\/(www\.)?/, "");
        s.expires = Date.now() + j.expires_in * 1000; s.interval = (j.interval || 5) * 1000; s.device = j.device_code; s.status = "Waiting for you to approve…";
        refresh(s); S.pair.poll(s);
      }, function (e) { s.err = e.message + " (check CLIENT_ID in config.js)"; refresh(s); });
    },
    poll: function (s) {
      s.timer = setTimeout(function () {
        if (top() !== s) return;
        if (Date.now() > s.expires) { s.err = "That code expired."; s.code = null; refresh(s); return; }
        devicePoll(s.device).then(function (j) {
          if (j.access_token) {
            saveTokens(j); mode = "user"; store.set("mode", mode); pruneCache();
            toast("Signed in"); Data.me().catch(function () {}); goRoot("home"); return;
          }
          if (j.error === "slow_down") s.interval += 2000;
          if (j.error === "access_denied") { s.err = "Sign-in was declined."; s.code = null; refresh(s); return; }
          if (j.error && j.error !== "authorization_pending" && j.error !== "slow_down") { s.err = j.error_description || j.error; refresh(s); return; }
          S.pair.poll(s);
        }, function () { S.pair.poll(s); });
      }, s.interval);
    },
    unmount: function (s) { clearTimeout(s.timer); },
    html: function (s) {
      var body;
      if (!CFG.CLIENT_ID || !CFG.CLIENT_SECRET) {
        body = '<div class="pairbox"><h2>One-time setup needed</h2><p>Add your Google <b>CLIENT_ID</b> and <b>CLIENT_SECRET</b> to <b>config.js</b> in your GitHub repo — the README walks you through it in about 5 minutes.</p></div>';
      } else if (s.err) {
        body = '<div class="pairbox"><h2>Hmm.</h2><p>' + esc(s.err) + '</p></div><button class="btn primary" data-r="1" data-c="0" data-act="again">Get a new code</button>';
      } else if (s.code) {
        body = '<div class="pairbox"><p class="step">On your phone, go to</p><div class="url">' + esc(s.url) + '</div><p class="step">and enter</p><div class="code">' + esc(s.code) + '</div><p class="status"><i class="pulse"></i>' + esc(s.status) + "</p></div>";
      } else body = '<div class="pairbox"><p class="status"><i class="pulse"></i>' + esc(s.status || "") + "</p></div>";
      return '<div class="scr pair">' + topbar(s, "Sign in") + body + "</div>";
    },
    defaultFocus: function (s, rows) { return [rows.length - 1, 0]; },
    act: function (s, a) { if (a === "again") S.pair.start(s); }
  };

  S.home = {
    init: function (s) {
      if (mode === "user" && !me) Data.me().catch(function () {});
      if (mode !== "guest") load(s, "feed", Data.feed);
      load(s, "trend", Data.trending);
      if (mode === "user") { load(s, "liked", Data.liked); load(s, "pls", function () { return Data.playlists(); }); load(s, "subsList", Data.subs); }
      if (mode === "demo") load(s, "subsList", Data.subs);
    },
    html: function (s) {
      var feed = filterShorts(s.feed || []);
      var fresh = [];
      if (s.subsList && s.feed) {
        var seen = {}, recent = (s.feed || []).filter(function (v) { return Date.now() - v.at < 3 * 86400000; });
        recent.forEach(function (v) { if (!seen[v.chId]) { seen[v.chId] = 1; var c = s.subsList.filter(function (x) { return x.id === v.chId; })[0]; if (c) fresh.push(c); } });
      }
      var shelves = [
        { title: "Continue watching", kind: "video", items: continueWatching() },
        { title: mode === "user" || mode === "demo" ? "New from subscriptions" : "", kind: "video", items: mode === "guest" ? [] : feed.slice(0, 20) },
        { title: "Channels with new videos", kind: "channel", items: fresh.slice(0, 20) },
        { title: "Trending", kind: "video", items: filterShorts(s.trend || []) },
        { title: "Liked videos", kind: "video", items: s.liked || [] },
        { title: "Your playlists", kind: "playlist", items: s.pls || [] }
      ];
      return browseHTML(s, topbar(s), shelves, "Nothing to show yet");
    },
    defaultFocus: browseDefault, onFocus: browseFocus,
    act: function (s, a) { if (a === "retry") { pruneCache(); s.started = false; s.nav = null; render(); } }
  };

  S.subs = {
    init: function (s) { load(s, "feed", Data.feed); },
    html: function (s) {
      if (mode === "guest") return browseHTML(s, topbar(s), [], "Sign in to see your subscriptions");
      var vs = filterShorts(s.feed || []);
      if (settings.hideWatched) vs = vs.filter(function (v) { return progressOf(v) < 0.92; });
      var groups = {};
      vs.forEach(function (v) { var b = dayBucket(v.at); (groups[b] = groups[b] || []).push(v); });
      var shelves = ["Today", "Yesterday", "This week", "Earlier"].map(function (b) { return { title: b, kind: "video", items: groups[b] || [] }; });
      return browseHTML(s, topbar(s), shelves, "No new videos");
    },
    defaultFocus: browseDefault, onFocus: browseFocus,
    act: function (s, a) { if (a === "retry") { pruneCache(); s.started = false; s.nav = null; render(); } }
  };

  S.channels = {
    init: function (s) { if (mode !== "guest") load(s, "list", Data.subs); },
    html: function (s) {
      var body;
      if (mode === "guest") body = '<div class="msg"><p>Sign in to see the channels you follow</p></div>';
      else if (!s.list) body = s.loading ? '<div class="msg"><p class="status"><i class="pulse"></i>Loading channels…</p></div>' : stateMsg(s);
      else {
        var list = s.list.slice().sort(function (a, b) { return a.title.localeCompare(b.title); }), rows = [];
        for (var i = 0; i < list.length; i += 4) rows.push(list.slice(i, i + 4));
        body = '<div class="grid-vp"><div class="vscroll" data-pad="12">' + rows.map(function (row, ri) {
          return '<div class="grow" data-rowbox>' + row.map(function (c, ci) { return chanCard(s, c, ri + 1, ci); }).join("") + "</div>";
        }).join("") + "</div></div>";
      }
      return '<div class="scr channels"><div class="blurbg"><img alt=""></div>' + topbar(s) + '<div class="countline">' + (s.list ? s.list.length + " channels · A–Z" : "") + "</div>" + body + "</div>";
    },
    defaultFocus: browseDefault,
    onFocus: function (s, el, root) {
      if (el.dataset.i == null) return;
      var c = s.reg[+el.dataset.i].c, img = root.querySelector(".blurbg img");
      if (img && img.dataset.src !== c.thumb) { img.dataset.src = c.thumb; img.classList.remove("on"); img.onload = function () { img.classList.add("on"); }; img.src = c.thumb; }
    },
    act: function (s, a) { if (a === "retry") { pruneCache(); s.started = false; render(); } }
  };

  S.channel = {
    init: function (s) { load(s, "data", function () { return Data.channel(s.params.id); }); },
    html: function (s) {
      var d = s.data, p = s.params;
      var badge = '<div class="tbadge">' + (p.thumb || (d && d.info.thumb) ? '<img src="' + esc(p.thumb || d.info.thumb) + '" alt="">' : "") + "</div>";
      var title = (d ? d.info.title : p.title) + (d && d.info.subs ? '  ·  ' + fmtNum(d.info.subs) + " subs" : "");
      var shelves = d ? [
        { title: "Latest uploads", kind: "video", items: filterShorts(d.videos).slice(0, 25) },
        { title: "Popular uploads", kind: "video", items: filterShorts(d.videos).filter(function (v) { return v.views != null; }).slice().sort(function (a, b) { return b.views - a.views; }).slice(0, 10) },
        { title: "Playlists", kind: "playlist", items: d.playlists }
      ] : [];
      return browseHTML(s, topbar(s, title, badge), shelves, "No uploads");
    },
    defaultFocus: browseDefault, onFocus: browseFocus,
    act: function (s, a) { if (a === "retry") { s.started = false; render(); } }
  };

  S.playlist = {
    init: function (s) { load(s, "vids", function () { return Data.playlist(s.params.p.id); }); },
    html: function (s) {
      var vs = s.vids || [], shelves = [];
      for (var i = 0; i < vs.length; i += 12) shelves.push({ title: i === 0 ? "Videos" : "Videos " + (i + 1) + "–" + Math.min(vs.length, i + 12), kind: "video", items: vs.slice(i, i + 12) });
      return browseHTML(s, topbar(s, s.params.p.title), shelves, "This playlist is empty");
    },
    defaultFocus: browseDefault, onFocus: browseFocus,
    act: function (s, a) { if (a === "retry") { s.started = false; render(); } }
  };

  S.search = {
    html: function (s) {
      var sugg = ["Music", "News", "Podcasts", "Gaming", "Cooking", "Science"];
      var body = '<div class="sfield" data-rowbox>' + I.search + '<input id="q" type="search" placeholder="Search YouTube" enterkeyhint="search" autocomplete="off" data-r="1" data-c="0" value="' + esc(s.q || "") + '"><button class="btn small" data-r="1" data-c="1" data-act="go">Go</button></div>';
      var shelves = [];
      if (recents.length) shelves.push({ title: "Recent", kind: "chip", items: recents.slice(0, 10) });
      shelves.push({ title: "Ideas", kind: "chip", items: sugg });
      body += '<div class="search-shelves">' + shelvesHTML(s, shelves, 2) + "</div>";
      if (mode === "guest" || mode === "user") body += '<p class="hint">Select the box to open the keyboard</p>';
      return '<div class="scr search">' + topbar(s) + body + "</div>";
    },
    defaultFocus: function () { return [1, 0]; },
    mount: function (s, el) {
      var q = el.querySelector("#q");
      q.addEventListener("input", function () { s.q = q.value; });
      q.addEventListener("change", function () { s.q = q.value; if (top() === s && q.value.trim()) S.search.run(q.value); });
      q.addEventListener("keydown", function (e) { if (e.key === "Enter" && q.value.trim()) { e.preventDefault(); S.search.run(q.value); } });
    },
    run: function (q) {
      q = q.trim(); if (!q) return;
      recents = [q].concat(recents.filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); })).slice(0, 10);
      store.set("recents", recents);
      push("results", { q: q });
    },
    act: function (s, a) { if (a === "go") S.search.run(s.q || ""); }
  };

  S.results = {
    init: function (s) { load(s, "res", function () { return Data.search(s.params.q); }); },
    html: function (s) {
      var r = s.res || {};
      return browseHTML(s, topbar(s, "“" + s.params.q + "”"), [
        { title: "Videos", kind: "video", items: filterShorts(r.videos || []) },
        { title: "Channels", kind: "channel", items: r.channels || [] }
      ], "No results");
    },
    defaultFocus: browseDefault, onFocus: browseFocus,
    act: function (s, a) { if (a === "retry") { s.started = false; render(); } }
  };

  S.detail = {
    html: function (s) {
      var v = s.params.v, h = hist[v.id], p = progressOf(v), resume = h && p > 0.01 && p < 0.92 && h.p > 10;
      var av = avatars[v.chId];
      var meta = [v.views != null ? fmtNum(v.views) + " views" : "", v.live ? "● LIVE" : ago(v.at), v.duration ? fmtTime(v.duration) : ""].filter(Boolean).join('<i class="dot"></i>');
      var c = 0, btns = '<button class="btn primary big" data-r="1" data-c="' + c++ + '" data-act="play">' + I.play + (resume ? "Resume " + fmtTime(h.p) : "Play") + "</button>";
      if (resume) btns += '<button class="btn icon" data-r="1" data-c="' + c++ + '" data-act="restart" aria-label="Play from start">' + I.restart + "</button>";
      if (v.chId && v.chId.indexOf("demo") !== 0) btns += '<button class="btn chanbtn" data-r="1" data-c="' + c++ + '" data-act="chan">' + (av ? '<img src="' + esc(av) + '" alt="">' : I.chan) + "<span>" + esc(v.ch) + "</span></button>";
      return '<div class="scr detail"><div class="hero big"><img class="hb on" src="' + esc(v.hero || v.thumb) + '" alt=""><div class="shade"></div></div>' + topbar(s, "") +
        '<div class="dinfo"><h2 class="htitle">' + esc(v.title) + '</h2><div class="hmeta">' + esc(v.ch) + '<i class="dot"></i>' + meta + "</div>" +
        (resume ? '<div class="hprog wide"><i style="width:' + (p * 100).toFixed(1) + '%"></i></div>' : "") +
        '<p class="desc">' + esc(v.desc || "") + '</p></div><div class="dbtns">' + btns + "</div></div>";
    },
    mount: function (s, el) {
      var img = el.querySelector(".hb"), v = s.params.v;
      img.onload = function () { if (img.naturalWidth <= 120 && img.src !== v.thumb) img.src = v.thumb; };
      img.onerror = function () { if (img.src !== v.thumb) img.src = v.thumb; };
    },
    defaultFocus: function () { return [1, 0]; },
    act: function (s, a) {
      var v = s.params.v;
      if (a === "play") push("player", { v: v, start: hist[v.id] && progressOf(v) < 0.92 ? hist[v.id].p : 0 });
      else if (a === "restart") push("player", { v: v, start: 0 });
      else if (a === "chan") push("channel", { id: v.chId, title: v.ch, thumb: avatars[v.chId] });
    }
  };

  /* ---------------- player ---------------- */
  var ytApi = null;
  function loadYT() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (ytApi) return ytApi;
    ytApi = new Promise(function (res, rej) {
      var t = setTimeout(function () { ytApi = null; rej(new Error("Couldn't reach the YouTube player")); }, 12000);
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { clearTimeout(t); if (prev) prev(); res(); };
      var sc = document.createElement("script"); sc.src = "https://www.youtube.com/iframe_api"; sc.onerror = function () { clearTimeout(t); ytApi = null; rej(new Error("Couldn't reach the YouTube player")); };
      document.head.appendChild(sc);
    });
    return ytApi;
  }

  S.player = {
    html: function (s) {
      var v = s.params.v;
      return '<div class="scr player show">' +
        '<div class="ptop"><div class="pt">' + esc(v.title) + '</div><div class="pc">' + esc(v.ch) + "</div></div>" +
        '<div class="pvid"><img class="pposter" src="' + esc(v.hero || v.thumb) + '" alt=""><div id="ytp"></div><div class="pshield"></div><div class="pspin"><i class="pulse"></i></div></div>' +
        '<div class="pbot"><div class="pbar"><span class="pcur">0:00</span><div class="ptrack"><i class="pfill"></i><i class="pseg-wrap"></i></div><span class="pdur">' + (v.duration ? fmtTime(v.duration) : "") + "</span></div>" +
        '<div class="pctrl">' +
        '<button class="pbtn" data-r="0" data-c="0" data-act="exit" aria-label="Back">' + I.back + "<span>Back</span></button>" +
        '<button class="pbtn" data-r="0" data-c="1" data-act="rew" aria-label="Back 15 seconds">' + I.rew + "<span>−15s</span></button>" +
        '<button class="pbtn main" data-r="0" data-c="2" data-act="toggle" aria-label="Play or pause">' + I.pause + "<span>Pause</span></button>" +
        '<button class="pbtn" data-r="0" data-c="3" data-act="fwd" aria-label="Forward 15 seconds">' + I.fwd + "<span>+15s</span></button>" +
        "</div></div><div class='pflash'></div></div>";
    },
    defaultFocus: function () { return [0, 2]; },
    mount: function (s, el) {
      s.el = el; s.segs = []; s.skipped = {}; s.n = 0;
      S.player.wake(s);
      if (settings.sponsorBlock && mode !== "demo") {
        fetch("https://sponsor.ajay.app/api/skipSegments?videoID=" + encodeURIComponent(s.params.v.id) + '&categories=["sponsor","selfpromo","interaction"]')
          .then(function (r) { return r.ok ? r.json() : []; }).then(function (j) { s.segs = (j || []).map(function (x) { return { a: x.segment[0], b: x.segment[1], c: x.category }; }); S.player.drawSegs(s); }).catch(function () {});
      }
      loadYT().then(function () {
        if (top() !== s) return;
        s.yt = new YT.Player("ytp", {
          width: 600, height: 338, videoId: s.params.v.id,
          playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, modestbranding: 1, start: Math.floor(s.params.start || 0) },
          events: {
            onReady: function (e) {
              var f = el.querySelector("iframe"); if (f) { f.setAttribute("tabindex", "-1"); f.setAttribute("aria-hidden", "true"); }
              e.target.playVideo(); Nav.focus(true);
              s.tick = setInterval(function () { S.player.tick(s); }, 500);
            },
            onStateChange: function (e) {
              var playing = e.data === YT.PlayerState.PLAYING;
              s.playing = playing;
              el.classList.toggle("buffering", e.data === YT.PlayerState.BUFFERING);
              if (playing) el.classList.add("started");
              S.player.setToggle(s);
              if (e.data === YT.PlayerState.ENDED) { S.player.save(s, true); S.player.wake(s, true); }
              if (playing) S.player.wake(s); else S.player.wake(s, true);
              Nav.focus(true);
            },
            onError: function (e) {
              var msg = e.data === 101 || e.data === 150 ? "The uploader doesn't allow this video to play outside YouTube" : e.data === 5 ? "This video can't play on this device" : "This video is unavailable";
              el.querySelector(".pvid").insertAdjacentHTML("beforeend", '<div class="perr">' + esc(msg) + "</div>");
              el.classList.add("started"); S.player.wake(s, true);
            }
          }
        });
      }, function (e) {
        el.querySelector(".pvid").insertAdjacentHTML("beforeend", '<div class="perr">' + esc(e.message) + "</div>");
      });
    },
    tick: function (s) {
      if (!s.yt || !s.yt.getCurrentTime) return;
      var t = s.yt.getCurrentTime() || 0, d = s.yt.getDuration() || s.params.v.duration || 0;
      s.t = t; s.d = d;
      var el = s.el;
      el.querySelector(".pcur").textContent = fmtTime(t);
      if (d) { el.querySelector(".pdur").textContent = fmtTime(d); el.querySelector(".pfill").style.width = (t / d * 100) + "%"; }
      if (s.segs.length && s.playing) {
        s.segs.forEach(function (g, i) {
          if (!s.skipped[i] && t >= g.a && t < g.b - 0.5) { s.skipped[i] = 1; s.yt.seekTo(g.b, true); toast(g.c === "sponsor" ? "Skipped sponsor" : "Skipped " + (g.c === "selfpromo" ? "self-promo" : "reminder")); }
        });
        if (!s.drawn && d) S.player.drawSegs(s);
      }
      if (++s.n % 10 === 0) S.player.save(s);
    },
    drawSegs: function (s) {
      var d = s.d || s.params.v.duration; if (!d || !s.segs.length) return;
      s.drawn = true;
      s.el.querySelector(".pseg-wrap").innerHTML = s.segs.map(function (g) { return '<b style="left:' + (g.a / d * 100) + "%;width:" + ((g.b - g.a) / d * 100) + '%"></b>'; }).join("");
    },
    save: function (s, ended) {
      if (!s.d) return;
      var v = s.params.v;
      hist[v.id] = { p: ended ? s.d : s.t || 0, d: s.d, at: Date.now(), v: { id: v.id, title: v.title, ch: v.ch, chId: v.chId, at: v.at, duration: v.duration || Math.round(s.d), views: v.views, thumb: v.thumb, hero: v.hero, desc: v.desc } };
      saveHist();
    },
    setToggle: function (s) {
      var b = s.el.querySelector(".pbtn.main");
      b.innerHTML = (s.playing ? I.pause + "<span>Pause</span>" : I.play + "<span>Play</span>");
    },
    wake: function (s, stay) {
      s.el.classList.add("show");
      clearTimeout(s.hide);
      if (!stay) s.hide = setTimeout(function () { if (s.playing) s.el.classList.remove("show"); }, 4000);
    },
    flash: function (s, html) {
      var f = s.el.querySelector(".pflash"); f.innerHTML = html; f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
    },
    onKey: function (s, k) {
      if (k === "Escape" || k === "Backspace" || k === "GoBack") return false;
      var hidden = !s.el.classList.contains("show");
      S.player.wake(s, !s.playing);
      return hidden && (KEYMAP[k] || k === "Enter" || k === " "); // first press only reveals the controls
    },
    act: function (s, a) {
      var y = s.yt; S.player.wake(s);
      if (a === "exit") { back(); return; }
      if (!y || !y.getCurrentTime) return;
      if (a === "toggle") { if (s.playing) { y.pauseVideo(); S.player.flash(s, I.pause); } else { y.playVideo(); S.player.flash(s, I.play); } }
      else if (a === "rew" || a === "fwd") {
        var t = clamp(y.getCurrentTime() + (a === "rew" ? -15 : 15), 0, (y.getDuration() || 1e9) - 1);
        y.seekTo(t, true); s.skipped = {};
        s.segs.forEach(function (g, i) { if (t >= g.b) s.skipped[i] = 1; });
        S.player.flash(s, a === "rew" ? I.rew : I.fwd); S.player.tick(s);
      }
    },
    unmount: function (s) {
      clearInterval(s.tick); clearTimeout(s.hide);
      if (s.yt && s.yt.getCurrentTime) { s.t = s.yt.getCurrentTime(); s.d = s.yt.getDuration(); S.player.save(s, s.d && s.t >= s.d - 2); }
      try { s.yt && s.yt.destroy(); } catch (e) {}
      s.yt = null;
    }
  };

  /* ---------------- settings ---------------- */
  var REGIONS = ["GB", "US", "IE", "CA", "AU", "NZ", "DE", "FR", "ES", "IT", "NL", "JP", "IN"];
  S.settings = {
    html: function (s) {
      function row(r, act, label, sub, val) {
        return '<button class="srow" data-r="' + r + '" data-c="0" data-act="' + act + '"><span class="sl"><b>' + label + "</b><small>" + sub + '</small></span><span class="sv">' + val + "</span></button>";
      }
      function tog(on) { return '<i class="tog' + (on ? " on" : "") + '"></i>'; }
      var acct = mode === "user" ? '<div class="acct" data-rowbox>' + (me && me.thumb ? '<img src="' + esc(me.thumb) + '" alt="">' : "") + "<div><b>" + esc(me ? me.title : "Signed in") + "</b><small>YouTube account</small></div></div>"
        : '<div class="acct" data-rowbox><div><b>' + (mode === "demo" ? "Demo mode" : "Browsing as guest") + "</b><small>Not signed in</small></div></div>";
      var r = 1, rows = [
        row(r++, "shorts", "Hide Shorts", "Keep feeds to full-length videos", tog(settings.hideShorts)),
        row(r++, "sb", "Skip sponsors", "Auto-skip sponsor segments (SponsorBlock)", tog(settings.sponsorBlock)),
        row(r++, "hw", "Hide watched", "In Subscriptions", tog(settings.hideWatched)),
        row(r++, "region", "Trending region", "Select to change", '<b class="pillv">' + settings.region + "</b>"),
        row(r++, "refresh", "Refresh feeds", "Fetch the latest videos now", ""),
        row(r++, "clear", "Clear watch history", "Resets progress bars on this device", ""),
        row(r++, "out", mode === "user" ? "Sign out" : "Sign in", mode === "user" ? "Disconnect your Google account" : "Connect your YouTube account", "")
      ];
      return '<div class="scr settings">' + topbar(s) + '<div class="set-vp"><div class="vscroll" data-pad="70">' + acct + rows.join("") + '<p class="ver">GlassTube ' + VERSION + "</p></div></div></div>";
    },
    defaultFocus: function () { return [1, 0]; },
    act: function (s, a) {
      if (a === "shorts") settings.hideShorts = !settings.hideShorts;
      else if (a === "sb") settings.sponsorBlock = !settings.sponsorBlock;
      else if (a === "hw") settings.hideWatched = !settings.hideWatched;
      else if (a === "region") settings.region = REGIONS[(REGIONS.indexOf(settings.region) + 1) % REGIONS.length];
      else if (a === "refresh") { pruneCache(); toast("Feeds will refresh"); }
      else if (a === "clear") { hist = {}; saveHist(); toast("Watch history cleared"); }
      else if (a === "out") { if (mode === "user") { signOut(); toast("Signed out"); } else { mode = null; store.del("mode"); stack = [mk("login")]; render(); } return; }
      saveSettings(); render(true);
    }
  };

  /* ---------------- boot ---------------- */
  if (mode === "user" && !auth) mode = null;
  stack = [mk(mode ? "home" : "login")];
  render();
  guard();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
})();
