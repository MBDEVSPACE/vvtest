# admin_web_panel

SourceBans-style web panel for bans and appeals.

## Stack

- Node.js Express API
- React frontend
- MySQL (shared with ti_admin)
- Discord or Steam OAuth via Passport

## Setup

### Backend

1. cd admin_web_panel/server
2. copy `.env.example` to `.env` and fill values
3. npm install
4. npm run start

### Frontend

1. cd admin_web_panel/client
2. npm install
3. npm run dev

## OAuth permissions

Login identity is mapped to role by identifier:
- Discord => `discord:<id>`
- Steam => `steam:<id>`

Grant staff roles in `ti_admin_user_roles` and `ti_admin_roles`.

Discord guild-role mapping is also supported:
- add `DISCORD_GUILD_ID`
- add `DISCORD_BOT_TOKEN`
- assign DB roles to identifiers like `discord_role:<roleId>`

Example:
- `discord_role:1126872809965105224` => `superadmin`

## API overview

- `GET /auth/me`
- `GET /api/bans`
- `GET /api/bans/:id`
- `PUT /api/bans/:id`
- `POST /api/bans/:id/unban`
- `GET /api/appeals`
- `GET /api/appeals/mine`
- `POST /api/appeals`
- `POST /api/appeals/:id/status`
- `GET /api/audit`
- `POST /api/uploads` screenshot upload endpoint

## screenshot-basic integration

Set FiveM `Config.Screenshots.UploadEndpoint` to:
- `http://your-web-panel-host:3050/api/uploads`

Set upload secret header in `Config.Screenshots.UploadHeaders`:
- `['x-upload-secret'] = '<UPLOAD_SECRET>'`
