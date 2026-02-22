# Supabase Setup Guide

This guide will help you set up Supabase as the database backend for your BRD Generation Pipeline.

## Prerequisites

- A Supabase account (sign up at https://app.supabase.com)
- Python 3.8+
- The dependencies installed: `pip install -r requirements.txt`

## Step 1: Create a Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Select an organization (create one if needed)
4. Enter a project name (e.g., "BRD-Generator")
5. Create a strong database password
6. Select your region
7. Click "Create new project"

The project will take a few minutes to initialize.

## Step 2: Get Your Supabase Credentials

1. In your project, go to **Settings > API**
2. Copy the **Project URL** (e.g., `https://xxxxx.supabase.co`)
3. Under "Project API keys", find the **"anon" public key** and copy it
4. Keep these credentials safe - you'll need them for the `.env` file

Note: Never use the "service_role" key in client-side code. The "anon" key is safe to use in your backend.

## Step 3: Create Database Schema

1. In your Supabase project, go to **SQL Editor**
2. Click "New Query"
3. Copy the entire contents of `supabase_schema.sql`
4. Paste it into the SQL editor
5. Click "Run" (or press Cmd+Enter on Mac, Ctrl+Enter on Windows)

The schema includes:
- `classified_chunks` - Stores text chunks with signal labels
- `brd_snapshots` - Stores frozen snapshots of chunks
- `brd_sections` - Stores generated BRD sections with versions
- `brd_validation_flags` - Stores validation issues
- `sessions` - Stores session metadata
- `ingest_logs` - Stores ingestion operation logs

## Step 4: Configure Your Backend

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your Supabase credentials:
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=your-anon-key-here
   DB_MODE=supabase
   ```

3. Add other required credentials:
   ```env
   GROQ_API_KEY=your_groq_key
   SLACK_TOKEN=your_slack_token
   etc.
   ```

## Step 5: Install Python Dependencies

```bash
pip install -r requirements.txt
```

This will install the Supabase client library and all other dependencies.

## Step 6: Test the Connection

Create a simple test script to verify the connection works:

```python
# test_supabase_connection.py
import sys
from pathlib import Path

# Add the parent directory so we can import modules
sys.path.insert(0, str(Path(__file__).parent))

from brd_module.supabase_storage import init_db, get_supabase_client

if __name__ == "__main__":
    try:
        print("Testing Supabase connection...")
        init_db()
        print("✓ Successfully connected to Supabase!")
        
        # Try to query sessions table
        client = get_supabase_client()
        result = client.table("sessions").select("*").limit(1).execute()
        print(f"✓ Successfully queried tables. Found {len(result.data)} sessions.")
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        sys.exit(1)
```

Run it with:
```bash
python test_supabase_connection.py
```

## Step 7: Update Your Code to Use Supabase Storage

### Option A: Use the Supabase Storage Module

Replace imports in your code:

**Old (PostgreSQL/SQLite fallback):**
```python
from brd_module.storage import store_chunks, get_active_signals
```

**New (Supabase):**
```python
from brd_module.supabase_storage import store_chunks, get_active_signals
```

### Option B: Update storage.py to use Supabase

You can modify the existing `storage.py` to support both databases by checking an environment variable.

## Using Supabase Functions in Your Code

Here's an example of using the Supabase storage module:

```python
from brd_module.supabase_storage import (
    store_chunks,
    get_active_signals,
    get_noise_items,
    create_snapshot,
    store_brd_section,
    get_latest_brd_sections,
    create_session
)
from brd_module.schema import ClassifiedChunk

# Create a session
session_id = create_session(
    "session-001",
    project_name="My BRD Project",
    description="Generated from emails"
)

# Store classified chunks
chunks = [
    ClassifiedChunk(
        session_id="session-001",
        source_ref="msg-123",
        raw_text="The system must support user login",
        cleaned_text="system must support user login",
        label="requirement",
        confidence=0.95,
        reasoning="Clear requirement statement"
    ),
    # ... more chunks
]
store_chunks(chunks)

# Get active signals
signals = get_active_signals(session_id="session-001")
print(f"Found {len(signals)} active signals")

# Create a snapshot
snapshot_id = create_snapshot(session_id="session-001")

# Store a BRD section
store_brd_section(
    session_id="session-001",
    snapshot_id=snapshot_id,
    section_name="Overview",
    content="The system is...",
    source_chunk_ids=["chunk-1", "chunk-2"],
    human_edited=False
)
```

## Row Level Security (Optional)

If you want to enable RLS for multi-tenant support, you can set up policies in Supabase:

1. Go to **Authentication > Policies**
2. Select a table
3. Click "New Policy"
4. Create policies based on `session_id` to isolate data per session

Example policy:
```sql
CREATE POLICY "Users can only see their sessions"
ON classified_chunks FOR SELECT
USING (auth.uid() = session_id);
```

## Troubleshooting

### Connection Failed: "SUPABASE_URL not found"
- Make sure you've created a `.env` file with your credentials
- Check that `SUPABASE_URL` and `SUPABASE_KEY` are set correctly
- Verify there are no extra spaces or quotes in the values

### "Table X does not exist"
- Make sure you've run the `supabase_schema.sql` script in the Supabase SQL Editor
- Wait a few seconds after running the script before testing
- Try refreshing the page and checking the Tables list under "Database"

### Slow Queries
- Check that all indexes were created properly
- Use the Supabase Query Performance tool to optimize
- Consider enabling caching for read-heavy operations

### CORS Issues
- If using from a frontend, allow the frontend domain in **Settings > CORS**
- Or set CORS to `*` for development (not recommended for production)

## Deployment Considerations

When deploying to production:

1. **Use environment variables** for all credentials (never commit `.env`)
2. **Use RLS (Row Level Security)** to isolate data per user/session
3. **Enable HTTPS** (Supabase does this by default)
4. **Set up backups** in Supabase settings
5. **Monitor usage** in the Supabase dashboard
6. **Use prepared statements** in SQL queries (which the ORM does automatically)

## Switching Back to PostgreSQL

If you want to switch back to direct PostgreSQL:

1. Update `.env`:
   ```env
   DB_MODE=postgres
   DB_HOST=your_host
   DB_PORT=5432
   DB_NAME=your_db
   DB_USER=your_user
   DB_PASS=your_password
   ```

2. Revert your code imports back to `from brd_module.storage import ...`

3. Run the SQL schema on your PostgreSQL database

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Python Client](https://github.com/supabase-community/supabase-py)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## Support

For issues with:
- **Supabase**: Check [Supabase Docs](https://supabase.com/docs) or [GitHub Issues](https://github.com/supabase/supabase/issues)
- **Python Client**: See [supabase-py](https://github.com/supabase-community/supabase-py) GitHub
- **This Backend**: Check the main README.md
