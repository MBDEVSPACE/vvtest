# Hosting Guide — TI Admin Web Panel

This guide covers self-hosting the panel in production, configuring environment variables, setting up a reverse proxy, keeping the backend alive with PM2, and distributing the panel without exposing React source code.

---

## Requirements

| Software | Version |
|---|---|
| Node.js | 18 LTS or higher |
| MySQL | 5.7 / 8.x or MariaDB 10.x |
| PM2 (optional, recommended) | latest |
| Nginx | latest stable |

---

## 1. Backend Setup (`server/`)

### 1.1 Install dependencies

```bash
cd server
npm install
```

### 1.2 Configure environment variables

Copy the example file and fill in every value:

```bash
cp .env.example .env
```

Open `.env` and set the following:

```env
# Port the API listens on
PORT=3050

# URL of the frontend — used for CORS and cookie scoping
# Must match the scheme + domain buyers will host the frontend on
CLIENT_URL=https://panel.yourdomain.com

# Secure random string — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=replace-with-a-long-random-secret

# FiveM MySQL database — must be the same DB your FiveM server writes to
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=fivem_user
MYSQL_PASSWORD=your_db_password
MYSQL_DATABASE=fivem

# Discord OAuth2 app (create at https://discord.com/developers/applications)
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_CALLBACK_URL=https://api.yourdomain.com/auth/discord/callback
DISCORD_GUILD_ID=your_server_id
DISCORD_BOT_TOKEN=your_bot_token

# Steam OpenID (get API key at https://steamcommunity.com/dev/apikey)
STEAM_RETURN_URL=https://api.yourdomain.com/auth/steam/callback
STEAM_REALM=https://api.yourdomain.com/
STEAM_API_KEY=your_steam_api_key
```

> **Important:** `CLIENT_URL` must exactly match the domain you serve the frontend from. Discord and Steam callback URLs must be registered inside the respective developer portals and must match what you set here.

### 1.3 Discord Developer Portal Setup

1. Go to https://discord.com/developers/applications and open (or create) your app.
2. Under **OAuth2 > Redirects**, add: `https://api.yourdomain.com/auth/discord/callback`
3. Copy **Client ID** and **Client Secret** into `.env`.
4. Under **Bot**, enable your bot and copy the token into `.env`.
5. Invite the bot to your Discord server with the `bot` scope and `Read Members` permission.

### 1.4 Start the backend

**Development:**
```bash
npm start
```

**Production with PM2:**
```bash
npm install -g pm2
pm2 start src/index.js --name "ti-admin-api" --interpreter node
pm2 save
pm2 startup
```

**PM2 ecosystem file** (`server/ecosystem.config.cjs`):
```js
module.exports = {
  apps: [{
    name: 'ti-admin-api',
    script: 'src/index.js',
    cwd: '/var/www/ti-admin/server',
    interpreter: 'node',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
```

Start with:
```bash
pm2 start ecosystem.config.cjs
```

---

## 2. Frontend Setup (`client/`)

### 2.1 Install dependencies

```bash
cd client
npm install
```

### 2.2 Configure environment variables

```bash
cp .env.example .env
```

Open `client/.env` and set:

```env
# Full URL of your hosted backend — no trailing slash
VITE_API_BASE_URL=https://api.yourdomain.com
```

This is the only variable the frontend needs. All API calls and OAuth login links will resolve to this URL at build time.

### 2.3 Build

```bash
npm run build
```

This produces a `client/dist/` folder of static files — HTML, JS, CSS. No Node.js required to serve it.

### 2.4 Serve the dist

Upload the contents of `client/dist/` to any static host:

- **Nginx** (see Section 3)
- Cloudflare Pages
- Netlify / Vercel (static deploy)
- Apache `DocumentRoot`
- Any CDN-backed object storage (S3, R2, etc.)

---

## 3. Nginx Configuration

### 3.1 Frontend (static files)

```nginx
server {
    listen 80;
    server_name panel.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name panel.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/panel.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.yourdomain.com/privkey.pem;

    root /var/www/ti-admin/client/dist;
    index index.html;

    # React Router — all routes fall back to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively
    location ~* \.(js|css|png|jpg|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 3.2 Backend API (reverse proxy)

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3050;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";

        # Required for session cookies over HTTPS
        proxy_cookie_flags ~ Secure SameSite=None;
    }
}
```

> **SSL:** Use Certbot to obtain free Let's Encrypt certificates:
> ```bash
> certbot --nginx -d panel.yourdomain.com -d api.yourdomain.com
> ```

---

## 4. Database

The backend must point to the **same MySQL database your FiveM server uses**. This is how live player data, bans, warnings, and appeals stay in sync with the in-game resource.

If your FiveM server runs on a separate machine, either:
- Open port `3306` on that machine and allow your VPS IP in the firewall, or
- Use a managed database service both servers connect to

Make sure the MySQL user has full read/write access to the `fivem` schema (or whichever name you use).

Run the schema migration if it has not been applied:

```bash
# From ti_admin resource folder
mysql -u root -p fivem < sql/schema.sql
```

---

## 5. Distributing Without Exposing Source Code

The compiled `client/dist/` folder contains bundled, minified JavaScript — React source (JSX) is **not recoverable** from it. You can distribute the dist folder without ever giving buyers the `client/src/` directory.

### What to ship to buyers

```
admin_web_panel/
  server/            ← full Node.js backend (required to run)
  client/
    dist/            ← compiled frontend — ship this, NOT src/
    .env.example     ← so buyers know what to set
  HOSTING.md         ← this file
```

### What NOT to ship

```
client/src/          ← React source — keep this private
client/node_modules/ ← not needed; buyers run npm install themselves
server/node_modules/ ← same
```

### How buyers use it

1. Copy `server/` to their VPS.
2. `cd server && npm install && cp .env.example .env` — fill in values.
3. Copy `client/dist/` to their web server root.
4. Set `client/.env` with `VITE_API_BASE_URL` pointing to their API domain, **then rebuild** (`npm run build`) — OR build once per buyer with their domain pre-baked.
5. Point Nginx at the dist folder.

> **Rebuild for each buyer:** Because `VITE_API_BASE_URL` is baked into the JS bundle at build time, you must rebuild `client/` with each buyer's API URL, then ship their personalised `dist/`. Alternatively, runtime config injection (e.g. a `/config.json` endpoint) can be used to avoid per-buyer builds — ask if you want that implemented.

---

## 6. Checklist Before Going Live

- [ ] `SESSION_SECRET` is a long, random, unique value (not the placeholder)
- [ ] `CLIENT_URL` matches your frontend domain exactly (including `https://`)
- [ ] Discord callback URL is registered in the Discord Developer Portal
- [ ] Steam API key is valid and `STEAM_REALM` matches your API domain
- [ ] Backend can connect to MySQL (test with `npm start` and check logs)
- [ ] Nginx is serving `dist/` with `try_files` fallback for React Router
- [ ] HTTPS is active on both domains (OAuth providers require it)
- [ ] Firewall blocks direct access to port 3050 (traffic only via Nginx)
- [ ] PM2 is configured to restart on reboot (`pm2 startup && pm2 save`)

---

## 7. Common Failures

| Symptom | Cause | Fix |
|---|---|---|
| Login redirects to localhost | `VITE_API_BASE_URL` not set before build | Rebuild after setting `.env` |
| CORS errors in browser | `CLIENT_URL` mismatch | Match `CLIENT_URL` to exact frontend origin |
| 401 after Discord login | Callback URL not in Discord portal | Register callback in developer portal |
| Ban data not matching in-game | Wrong DB credentials | Point `MYSQL_*` vars at FiveM's DB |
| Panel shows blank page on refresh | Missing Nginx `try_files` fallback | Add `try_files $uri $uri/ /index.html` |
| Cookies not sent cross-domain | HTTP in production or `SameSite` mismatch | Enforce HTTPS on both domains |
