# Environment Setup Guide

## Quick Start

For a fresh laptop, use this order:

1. Install Python 3.10+ and Node.js 18+.
2. Clone the repo and open the workspace root.
3. In `backend/`, copy `.env.example` to `.env`.
4. In `frontend/`, make sure `.env` contains `VITE_API_URL=http://localhost:8000/api/v1`.
5. Start the backend first, then the frontend.

### Backend `.env`

```powershell
Copy-Item .env.example .env
```

Edit `.env` with your values:

- Add your API keys (see below for where to get them)
- Update database settings if needed
- Generate a secure auth secret key

Restart the backend:

```bash
python -m uvicorn app.main:app --reload
```

## Frontend Environment

The frontend reads `VITE_API_URL` from `frontend/.env`. If the file is missing on the new laptop, create it with:

```env
VITE_API_URL=http://localhost:8000/api/v1
```

The chart migration already uses `Chart.js` and `react-chartjs-2`, so no Recharts install is needed.

---

## Getting API Keys

### 🔑 Google Gemini API Key (Required)

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click **"Get API Key"**
3. Create a new API key
4. Copy it to `LLM_GEMINI_API_KEY` in `.env`

**Free tier includes:** 60 requests per minute

### 🚀 Groq API Key (Optional - Recommended)

1. Go to [Groq Console](https://console.groq.com/keys)
2. Sign up or log in
3. Click **"Create API Key"**
4. Copy it to `LLM_GROQ_API_KEY` in `.env`

**Free tier includes:** Very fast inference, good for development

---

## Configuration Options

### Database

**Development (Default - SQLite):**
```env
DB_TYPE=sqlite
DB_SQLITE_PATH=./data/vizzy.db
```

**Production (PostgreSQL):**
```env
DB_TYPE=postgresql
DB_HOST=your-db-host.com
DB_PORT=5432
DB_NAME=vizzy
DB_USER=postgres
DB_PASSWORD=your_secure_password
```

### Authentication

**Generate a secure secret key:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Then paste it:
```env
AUTH_SECRET_KEY=your_generated_key_here
```

### LLM Providers

Vizzy uses a **fallback strategy**:
1. **Primary:** Gemini Pro (best quality)
2. **Secondary:** Groq (fastest)
3. **Fallback:** Gemini Flash (fastest + cheapest)

You can configure any or all of them.

---

## Security Best Practices

✅ **DO:**
- Keep `.env` file local, never commit it
- Use different keys for development/production
- Generate strong random secret keys
- Rotate API keys periodically
- Use environment-specific `.env` files

❌ **DON'T:**
- Commit `.env` to Git (it's in `.gitignore`)
- Share API keys in screenshots or logs
- Use default secret keys in production
- Hard-code credentials in source code

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `development` | `development`, `staging`, or `production` |
| `DEBUG` | `true` | Enable debug mode |
| `LOG_LEVEL` | `INFO` | Log verbosity level |
| `DB_TYPE` | `sqlite` | Database type (`sqlite` or `postgresql`) |
| `AUTH_SECRET_KEY` | - | **CHANGE THIS!** Secret key for JWT |
| `LLM_GEMINI_API_KEY` | - | Google Gemini API key |
| `LLM_GROQ_API_KEY` | - | Groq API key (optional) |
| `STORAGE_MAX_FILE_SIZE_MB` | `100` | Max upload file size |
| `RATE_LIMIT_REQUESTS_PER_MINUTE` | `60` | API rate limit |

---

## Troubleshooting

### "Missing API key" error
- Make sure you've created `.env` (not just `.env.example`)
- Check that your API key is valid and not expired
- Ensure no extra spaces around the `=` sign

### "Database connection failed"
- For SQLite: ensure `data/` directory exists
- For PostgreSQL: verify host, port, credentials

### "Invalid secret key"
- Generate a new one with the command above
- Ensure it's at least 32 characters

---

## Support

For more help, check:
- [Gemini API Documentation](https://ai.google.dev/tutorials)
- [Groq API Documentation](https://console.groq.com/docs)
- [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
