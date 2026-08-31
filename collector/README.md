# YamahaPulse Teltonika Collector

A tiny TCP server that understands your **FMB920** (Teltonika Codec 8 / 8E) and forwards
positions to your YamahaPulse app. No npm packages required — plain Node.js.

---

## Step 1 — Install Node.js

1. Go to https://nodejs.org
2. Download the **LTS** version and install with default options
3. Verify it works — open a terminal (Command Prompt / PowerShell / Terminal) and run:

       node --version

   You should see something like `v20.x.x`.

## Step 2 — Start the collector

In the terminal, go into this folder and run it:

    cd collector
    node server.js

You should see:

    [collector] listening for Teltonika devices on TCP port 5027

Leave this window open while testing.

## Step 3 — Test WITHOUT the tracker (important!)

Open a **second** terminal and run:

    node simulate.js

If you see `collector ACK'd 1 record(s)`, the pipeline works. Your device with IMEI
`353691842796392` must be **registered in Devices and assigned to a vehicle** for a
position to appear on the Live Tracking page (ingest rejects unknown IMEIs on purpose —
that keeps random internet traffic out of your data).

## Step 4 — Give the tracker a public address to reach your laptop

The tracker is on a mobile network, so it cannot reach `localhost` directly.

### One important truth about Cloudflare Tunnel

Cloudflare Tunnel's free quick tunnels only carry **HTTP(S)**. Teltonika trackers speak
raw **TCP**, and Cloudflare free tunnels can't accept raw TCP from a device that cannot
run `cloudflared` itself. Carrying arbitrary TCP through Cloudflare requires "Spectrum",
which is an Enterprise feature. So:

- **For testing now:** use **ngrok** (free, supports raw TCP)
- **For production later:** a cheap VPS (~$4/month on Hetzner / DigitalOcean) running
  this same `node server.js` — no tunnel needed at all

### ngrok (5 minutes, free)

1. Create an account at https://ngrok.com and install ngrok (their site has a
   Windows/Mac installer and step-by-step instructions)
2. Connect your account token (shown on their dashboard), e.g.:

       ngrok config add-authtoken YOUR_TOKEN

3. Start a TCP tunnel to your collector:

       ngrok tcp 5027

4. ngrok shows a forwarding address like:

       tcp://2.tcp.eu.ngrok.io:16432

   Your **host** is `2.tcp.eu.ngrok.io` and your **port** is `16432`.

## Step 5 — Point the FMB920 at that address

Easiest: **Teltonika Configurator** software (USB cable to the tracker):

1. Open the **GPRS** section:
   - APN: the APN of your SIM card provider (ask your SIM provider or Google
     "<provider> APN")
2. **Server settings**:
   - Domain: the ngrok host from step 4 (e.g. `2.tcp.eu.ngrok.io`)
   - Port: the ngrok port (e.g. `16432`)
   - Protocol: **TCP**
3. Data acquisition: leave defaults for now (moving ~every 60s is plenty to start)
4. Save to device

**Alternative (SMS)** — if your SIM can send SMS to the tracker and no login/password is
set (two leading spaces matter):

      setparam 2004:2.tcp.eu.ngrok.io;2005:16432;2006:0;2001:YOUR_APN

Within a minute or two the tracker should connect — you'll see it in the collector
terminal — and it will appear on the **Fleet → Live Tracking** map.

## Production checklist (when you're done testing)

- [ ] Rent a small VPS with a fixed public IP
- [ ] Run the collector with a process manager (`pm2 start server.js`)
- [ ] Set the VPS IP + port 5027 in the tracker configurator
- [ ] The Supabase ingest URL stays exactly the same — nothing else to change

## Environment variables

| Variable         | Default                                                        | Purpose              |
| ---------------- | -------------------------------------------------------------- | -------------------- |
| `COLLECTOR_PORT` | `5027`                                                         | TCP listening port   |
| `INGEST_URL`     | your Supabase ingest function                                  | Forwarding target    |