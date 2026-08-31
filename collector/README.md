# YamahaPulse Teltonika Collector

A tiny always-on TCP server that understands your **FMB920** (Teltonika Codec 8 / 8E) and
forwards positions to your YamahaPulse app. No npm packages required — plain Node.js.

---

## Why not Vercel / Netlify / Cloudflare Tunnel?

Those platforms only run short-lived **HTTP** functions. Your tracker speaks **raw TCP**
and needs a permanent open socket, so you need one small always-online server instead.
That's what this folder is. You deploy it once and forget it.

---

# Option A — Railway (recommended, easiest)

Railway gives you a public TCP address with zero server administration.

### 1. Push your project to GitHub
If the project isn't on GitHub yet: create a free GitHub account, create a new
repository, and upload this project (GitHub's web upload works — no git commands needed).

### 2. Create the Railway service
1. Go to https://railway.app and sign in with GitHub
2. **New Project → Deploy from GitHub repo** → pick your repo
3. Railway detects the repo. Open the new service → **Settings**:
   - **Root directory**: set to `collector`
   - Railway finds the `Dockerfile` and builds it automatically — nothing to install
4. **Settings → Networking**:
   - Delete/skip the HTTP domain
   - Click **TCP Proxy** and enable it
   - Railway shows you a public address like:
     `junction.proxy.rlwy.net:23456`

### 3. Done — write these down
- **Host:** `junction.proxy.rlwy.net` *(yours will differ)*
- **Port:** `23456` *(yours will differ)*

These are exactly what you'll type into the FMB920 in the last step below.

### 4. Check it's alive
In Railway → your service → **Logs**, you should see:

    [collector] listening for Teltonika devices on TCP port 5027
    [collector] forwarding to: https://glwinxaanstczuubxqqg.supabase.co/functions/v1/ingest

If logs look good, your collector is permanently online.

---

# Option B — Fly.io (free-ish, slightly more technical)

1. Install `flyctl` from https://fly.io/docs/hands-on/install-flyctl/
2. In this `collector` folder, run:
       fly launch --no-deploy
   When asked for a port, enter **5027**
3. Edit the generated `fly.toml`: in the `[[services]]` section, remove any
   `handlers = ["http"]` / `["tls"]` lines so it accepts raw TCP
4. Run:
       fly deploy
       fly ips allocate-v4
5. Your address is your allocated IPv4 + port 5027

---

# Option C — VPS ($0–$4/mo, most "pro")

Pick Oracle Cloud's free tier, Hetzner, or DigitalOcean and create the smallest Ubuntu
server. Then:

    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
    sudo apt install -y nodejs
    # upload this folder (scp or git clone), then:
    cd collector
    npm i -g pm2
    pm2 start server.js
    pm2 save && pm2 startup

Open port **5027** in the server's firewall/security group. Your address is the
server IP + port 5027, e.g. `203.0.113.10:5027`.

---

# Last step — point your FMB920 at it

**Before real tracking**, register IMEI `353691842796392` in the app under
*Assets → GPS Devices* and assign it to a vehicle — the ingest endpoint rejects
unknown IMEIs on purpose, which keeps strangers' traffic out of your fleet data.

### Via Teltonika Configurator (USB):

1. **GPRS** tab → **APN**: your SIM provider's APN (Google "<your provider> APN")
2. **Server settings**:
   - Domain / IP: the Railway host (e.g. `junction.proxy.rlwy.net`)
   - Port: the Railway port (e.g. `23456`)
   - Protocol: **TCP**
3. **Data acquisition**: defaults are fine (about once a minute while moving)
4. Save to device

### Via SMS (if the SIM has SMS and no config password is set — note the two leading spaces):

      setparam 2004:YOUR_HOST;2005:YOUR_PORT;2006:0;2001:YOUR_APN

Within 1–2 minutes the tracker connects — you'll see `IMEI accepted: 353691842796392`
in the Railway logs — and the vehicle appears on **Fleet → Live Tracking**.

## Environment variables

| Variable         | Default                                                     | Purpose            |
| ---------------- | ----------------------------------------------------------- | ------------------ |
| `COLLECTOR_PORT` | `5027`                                                      | TCP listening port |
| `INGEST_URL`     | Your Supabase ingest function (already set in `server.js`)  | Forwarding target  |