# Local PayFast Testing with ngrok

This guide explains how to expose your local easyrent24 app to the internet so PayFast can reach your ITN callback endpoint during local development.

---

## Why ngrok?

PayFast's sandbox environment needs to call your ITN endpoint (`/api/payments/payfast/notify`) when a payment completes. Your local `localhost:3000` is not reachable from the internet, so ngrok creates a tunnel that forwards internet traffic to your local app.

---

## Installation

### Windows (PowerShell)

Using Chocolatey (if installed):
```powershell
choco install ngrok
```

Or download manually:
1. Go to [ngrok.com/download](https://ngrok.com/download)
2. Download the Windows zip
3. Extract to a folder (e.g., `C:\tools\ngrok`)
4. Add to PATH: `$env:PATH += ";C:\tools\ngrok"`

### macOS

Using Homebrew:
```bash
brew install ngrok
```

Or download manually from [ngrok.com/download](https://ngrok.com/download)

### Linux

```bash
curl https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz | tar xvz
sudo mv ngrok /usr/local/bin/
```

---

## Setup & Configuration

### Step 1: Create ngrok Account (Optional but Recommended)

1. Go to [dashboard.ngrok.com](https://dashboard.ngrok.com)
2. Sign up (free account)
3. Get your auth token from the dashboard
4. Configure ngrok:
   ```bash
   ngrok authtoken <your-token>
   ```

**Benefits**:
- Longer-lived tunnels (free accounts get ~2 hour sessions)
- Reserved domains (same URL every restart)
- Better reliability

### Step 2: Test ngrok Installation

```bash
ngrok --version
ngrok http --help
```

---

## Running ngrok for easyrent24

### Basic Usage (One-Time Tunnel)

In a new terminal/PowerShell window:

```bash
ngrok http 3000
```

**Output**:
```
Session Status                online
Account                       <your-account>
Version                       3.x.x
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123def456.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123def456.ngrok.io`) — this is your public app URL.

### With Reserved Domain (Authenticated Users Only)

If you have a reserved domain configured in ngrok dashboard:

```bash
ngrok http --domain=myapp.ngrok.io 3000
```

This keeps the same URL across tunnel restarts.

---

## Using ngrok with easyrent24

### Step 1: Start ngrok Tunnel

In a terminal:
```bash
ngrok http 3000
```

Note the forwarding URL (e.g., `https://abc123.ngrok.io`)

### Step 2: Update Environment Variables

In `frontend/.env.local`:

```env
# Before
NEXT_PUBLIC_APP_URL=http://localhost:3000

# After (using the ngrok URL from above)
NEXT_PUBLIC_APP_URL=https://abc123.ngrok.io
```

### Step 3: Restart Frontend App

Stop and restart your frontend dev server so the new env var is loaded:

```bash
cd frontend
npm run dev
```

### Step 4: Configure PayFast Sandbox

In [sandbox.payfast.co.za](https://sandbox.payfast.co.za) dashboard:

**Settings** → **Notification Settings** → **ITN URL**:
```
https://abc123.ngrok.io/api/payments/payfast/notify
```

### Step 5: Test Payment Flow

1. Open your app in browser: `https://abc123.ngrok.io` (or click the link in ngrok output)
2. Create a test application and click "Pay"
3. Complete the payment in PayFast sandbox
4. PayFast should call your ITN endpoint
5. Check ngrok web dashboard (`http://localhost:4040`) to see the callback request

---

## Monitoring ngrok Traffic

While ngrok tunnel is running, open a browser to:

```
http://localhost:4040
```

This shows:
- All requests forwarded through ngrok
- Request headers, body, response
- Very useful for debugging ITN issues

Example: You should see a POST request to `/api/payments/payfast/notify` when PayFast sends the ITN callback.

---

## Common Issues & Troubleshooting

### "ngrok not found" / "command not found"

**Cause**: ngrok not in PATH or not installed

**Fix**:
```bash
# Verify installation
ngrok --version

# If not found, ensure it's in PATH:
# Windows: Add ngrok.exe folder to System PATH
# macOS/Linux: Install via package manager or move to /usr/local/bin
```

### "Bind error: Only one usage of socket address"

**Cause**: Port 3000 already in use

**Fix**:
```bash
# Find process using port 3000
# Windows:
netstat -ano | findstr :3000

# macOS/Linux:
lsof -i :3000

# Kill the process or use different port:
ngrok http 3001
```

### PayFast doesn't call the ITN endpoint

**Causes**:
1. ITN URL in PayFast dashboard is wrong
2. ngrok tunnel died (URL changed)
3. Firewall blocking the connection

**Fix**:
1. Double-check ITN URL in PayFast dashboard
2. Restart ngrok and update URL if it changed
3. Test manually: `curl https://abc123.ngrok.io/api/health`
4. Check ngrok dashboard (`http://localhost:4040`) to see incoming requests

### ngrok tunnel keeps dying after 2 hours

**Cause**: Free ngrok sessions expire

**Fix**:
1. Create ngrok account (free)
2. Get auth token from dashboard
3. Run `ngrok authtoken <token>`
4. Restart ngrok (now you get longer sessions)

Alternatively, use a reserved domain:
```bash
ngrok http --domain=myapp.ngrok.io 3000
```

---

## Best Practices

### 1. Keep ngrok Running in Separate Terminal

Don't background ngrok — keep it in a visible terminal so you can see when it dies or the URL changes.

### 2. Monitor ngrok Dashboard

Periodically check `http://localhost:4040` to see incoming requests and responses. This helps debug issues immediately.

### 3. Document Your ngrok URL

When testing, note the URL for reference:
```
ngrok URL: https://abc123.ngrok.io
Time: 2026-09-04 10:30 UTC
PayFast Sandbox ITN URL configured to: https://abc123.ngrok.io/api/payments/payfast/notify
```

### 4. Restart After ngrok Dies

If ngrok tunnel dies:
1. Note that the URL changed (new random URL assigned)
2. Update `NEXT_PUBLIC_APP_URL` in `.env.local`
3. Update ITN URL in PayFast dashboard
4. Restart frontend app

This is why authenticated ngrok (with reserved domain) is better for extended testing.

### 5. Test with Manual Script

For faster iteration on error scenarios, use the `test-payfast-itn.mjs` script:

```bash
node backend/scripts/test-payfast-itn.mjs --app-id abc123 --amount 250.00
```

This doesn't require PayFast UI interaction — just direct API testing.

---

## Using ngrok with Docker

If running the app in Docker for production-like testing:

### Option A: Forward to Docker Container

```bash
docker run -p 3000:3000 easyrent24:latest
ngrok http 3000
```

Same process as local Node.js.

### Option B: Use ngrok Inside Container

Add ngrok to Dockerfile and run it inside the container (more complex, usually not needed for testing).

---

## Stopping ngrok

Press `Ctrl+C` in the ngrok terminal. This stops the tunnel and makes your app inaccessible from the internet (ngrok URL returns connection refused).

---

## Next Steps

Once ngrok is running:

1. Follow `PAYFAST_E2E_TESTING_GUIDE.md` from Step 4 onwards
2. Use the ngrok dashboard to monitor PayFast's ITN callback
3. Use `test-payfast-itn.mjs` script to test error scenarios faster
4. When done, stop ngrok and remove it from your setup (for production, use real domain)

---

## Security Notes

⚠️ **Important for Security**:

- ngrok exposes your local app to the entire internet
- Only use for sandboxed/test applications
- **Never** expose production data or credentials through ngrok
- Use `NEXT_PUBLIC_` prefix only for data safe to expose (Supabase anon key is fine; service role key is NOT)
- Consider IP allowlisting in ngrok (advanced feature, paid plans)
- Rotate credentials regularly, especially if app was exposed for extended periods

For production, don't use ngrok — use a real deployed environment (staging server on AWS, Heroku, etc.).

