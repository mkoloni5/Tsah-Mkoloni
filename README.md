# DANSCOM 🤖

Modern, production-ready WhatsApp automation bot using Node.js, Baileys, and Firebase.

## 🚀 Features
- **Auto Status View & Like**: Automatically watch and react to statuses.
- **AI Integration**: Powered by Google Gemini for smart replies and commands (`.ai`, `.gpt`).
- **Persistent Sessions**: Auth data stored in Firebase Firestore (survives Render restarts).
- **Toggleable Settings**: Enable/disable features via `.enable [feature]` commands.
- **Premium System**: Weekly subscription management (5 KSH/week).
- **Analytics**: Track command usage and active users.
- **Anti-Ban**: Built-in delays and human-like interaction patterns.
- **Safety**: Rate limiting and helmet security.

### ⚠️ Key Creation Issues? (Bypass Mode)
If your organization blocks "Service Account Key Creation", follow these steps:
1. **Run in AI Studio**: If you are using the AI Studio Build environment, you **do not** need the private key. The bot will automatically use the project's internal credentials.
2. **Local Development**: If you can't get a key, the bot will automatically fall back to **Local Storage** (`auth_info_baileys` folder). Note that in Render, local files are deleted on every restart, so you'll have to scan the QR code again.
3. **Admin Request**: Ask your Workspace Administrator to grant you the `Service Account Key Admin` role or allow key creation in the IAM policies.

## 🛠 Setup Guide

### 1. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Create a new project.
3. Go to **Project Settings** > **Service Accounts**.
4. Click **Generate New Private Key**.
5. Copy the following from the downloaded JSON:
   - `project_id`
   - `private_key`
   - `client_email`

### 2. Environment Variables
Configure these in your Render deployment or `.env` file:
- `GEMINI_API_KEY`: Your Google AI Studio API Key.
- `FIREBASE_PROJECT_ID`: From your service account JSON.
- `FIREBASE_PRIVATE_KEY`: From your service account JSON (replace `\n` with actual newlines).
- `FIREBASE_CLIENT_EMAIL`: From your service account JSON.
- `OWNER_NUMBER`: Your WhatsApp number (e.g., `254712345678`).
- `PREFIX`: Command prefix (default: `.`).

### 3. Deploy to Render
1. Connect your GitHub repository to Render.
2. Render will automatically detect `render.yaml`.
3. Add the environment variables in the Render dashboard.
4. Once deployed, check the logs for the QR code to scan.

## 📝 Commands
- `.ping`: Check bot latency.
- `.ai [query]`: Ask Gemini AI.
- `.enable [feature]`: Toggle bot features (Owner only).
- `.stats`: View bot usage analytics.
- `.premium`: View premium benefits.
- `.checksub`: Check your subscription status.

## 🛡 Security & Stability
- Optimized for **Render Free Tier**.
- Automatic reconnection on disconnect.
- Lower memory footprint.
- Graceful shutdown handling.

---
Built with ❤️ using Google AI Studio.
