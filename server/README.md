# Planory OCR Proxy Server

Lightweight Node.js proxy that forwards Groq Vision API requests from the mobile app.
The **Groq API key lives ONLY here** — it is never sent to or stored in the mobile app.

## Deploy to Railway (Free — 5 minutes)

### 1. Push to GitHub
Make sure your project is on GitHub (the `.env` file is gitignored — your key is safe).

### 2. Go to Railway
1. Visit **https://railway.app** and sign in with GitHub
2. Click **"New Project" → "Deploy from GitHub repo"**
3. Select your `planory` repository
4. Choose **"server"** as the root directory (under Settings → Source)

### 3. Set the Environment Variable
In Railway dashboard → your service → **Variables** tab:
```
GROQ_API_KEY = gsk_your_actual_key_here
```

### 4. Get your URL
Railway gives you a URL like: `https://planory-proxy-production.up.railway.app`

### 5. Update the mobile app
Open `mobile/src/config/api.js` and paste your Railway URL:
```js
export const CLOUD_PROXY_URL = 'https://planory-proxy-production.up.railway.app';
```

That's it! Now the app will call your cloud proxy and scans will work even without your PC running.

---

## Local Development

```bash
# Copy .env.example and fill in your key
cp .env.example .env

# Start the proxy
node proxy.js
```

The proxy runs on `http://localhost:3001`.
- Android Emulator accesses it at `http://10.0.2.2:3001`
- iOS Simulator and physical devices use `http://localhost:3001`
