-- Supabase Schema for BRD Generation Pipeline
-- Run this SQL in the Supabase SQL Editor to set up the database schema

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: classified_chunks
-- Stores chunks of text from emails/documents with their classification labels
CREATE TABLE IF NOT EXISTS classified_chunks (
    chunk_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) DEFAULT 'email',
    source_ref VARCHAR(255),
    speaker VARCHAR(255),
    raw_text TEXT NOT NULL,
    cleaned_text TEXT,
    label VARCHAR(50) NOT NULL CHECK (label IN ('requirement', 'decision', 'stakeholder_feedback', 'timeline_reference', 'noise')),
    confidence NUMERIC(3, 2) CHECK (confidence >= 0 AND confidence <= 1),
    reasoning TEXT,
    suppressed BOOLEAN DEFAULT FALSE,
    manually_restored BOOLEAN DEFAULT FALSE,
    flagged_for_review BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data JSONB
);

-- Indexes for classified_chunks
CREATE INDEX IF NOT EXISTS idx_chunks_session ON classified_chunks(session_id);
CREATE INDEX IF NOT EXISTS idx_chunks_label ON classified_chunks(label);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON classified_chunks(source_ref);
CREATE INDEX IF NOT EXISTS idx_chunks_created ON classified_chunks(created_at);
CREATE INDEX IF NOT EXISTS idx_chunks_suppressed ON classified_chunks(suppressed);

-- Table: brd_snapshots
-- Stores frozen snapshots of chunks at specific points in time for BRD generation
CREATE TABLE IF NOT EXISTS brd_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    chunk_ids JSONB,
    description TEXT,
    data JSONB
);

-- Indexes for brd_snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_session ON brd_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON brd_snapshots(created_at);

-- Table: brd_sections
-- Stores generated BRD sections with version history
CREATE TABLE IF NOT EXISTS brd_sections (
    section_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    snapshot_id UUID,
    section_name VARCHAR(100) NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    source_chunk_ids JSONB,
    is_locked BOOLEAN DEFAULT FALSE,
    human_edited BOOLEAN DEFAULT FALSE,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data JSONB,
    FOREIGN KEY (snapshot_id) REFERENCES brd_snapshots(snapshot_id) ON DELETE SET NULL
);

-- Indexes for brd_sections
CREATE INDEX IF NOT EXISTS idx_sections_session ON brd_sections(session_id);
CREATE INDEX IF NOT EXISTS idx_sections_snapshot ON brd_sections(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_sections_name ON brd_sections(section_name);
CREATE INDEX IF NOT EXISTS idx_sections_version ON brd_sections(session_id, section_name, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_sections_created ON brd_sections(generated_at);

-- Table: brd_validation_flags
-- Stores validation issues and flags during BRD generation
CREATE TABLE IF NOT EXISTS brd_validation_flags (
    flag_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    section_name VARCHAR(100),
    flag_type VARCHAR(50) NOT NULL CHECK (flag_type IN ('missing_info', 'ambiguity', 'contradiction', 'grammar', 'other')),
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    auto_resolvable BOOLEAN DEFAULT FALSE,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for brd_validation_flags
CREATE INDEX IF NOT EXISTS idx_flags_session ON brd_validation_flags(session_id);
CREATE INDEX IF NOT EXISTS idx_flags_section ON brd_validation_flags(section_name);
CREATE INDEX IF NOT EXISTS idx_flags_severity ON brd_validation_flags(severity);
CREATE INDEX IF NOT EXISTS idx_flags_resolved ON brd_validation_flags(resolved);

-- Table: sessions
-- Stores metadata about each session
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
    project_name VARCHAR(255),
    description TEXT,
    metadata JSONB
);

-- Indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Table: ingest_logs
-- Stores logs of ingested documents
CREATE TABLE IF NOT EXISTS ingest_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_ref VARCHAR(255),
    status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
    chunk_count INTEGER,
    error_message TEXT,
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

-- Indexes for ingest_logs
CREATE INDEX IF NOT EXISTS idx_ingest_session ON ingest_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_ingest_source ON ingest_logs(source_type);
CREATE INDEX IF NOT EXISTS idx_ingest_status ON ingest_logs(status);

-- Enable Row Level Security (optional, for multi-tenancy support)
ALTER TABLE classified_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE brd_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE brd_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE brd_validation_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_logs ENABLE ROW LEVEL SECURITY;

-- Set timestamps automatically on update (trigger functions)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_classified_chunks_updated_at BEFORE UPDATE ON classified_chunks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brd_sections_updated_at BEFORE UPDATE ON brd_sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
