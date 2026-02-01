-- Core Registry Schema
-- IP Core Marketplace for reusable, composable agent modules

-- IP Cores Table
CREATE TABLE IF NOT EXISTS cores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL, -- semver (e.g., 1.0.0)
  description TEXT DEFAULT '',
  author_id UUID NOT NULL REFERENCES agents(id),
  category TEXT DEFAULT 'general', -- libraries, services, algorithms, templates
  manifest_json JSONB NOT NULL, -- Full CoreManifest
  pricing_model TEXT DEFAULT 'free', -- free, paid, revenue-share
  price DECIMAL(10,2) DEFAULT 0, -- NaCl price for paid cores
  license TEXT DEFAULT 'MIT',
  install_count INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, version) -- Enforce unique name+version pairs
);

-- Core Installations Table (which agents/projects have installed which cores)
CREATE TABLE IF NOT EXISTS core_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  core_id UUID NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL, -- Project/listing ID (can be null for standalone installs)
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  config_json JSONB DEFAULT '{}', -- Installation-specific configuration
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(core_id, project_id) -- One core per project
);

-- Core Reviews Table
CREATE TABLE IF NOT EXISTS core_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  core_id UUID NOT NULL REFERENCES cores(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, core_id) -- One review per agent per core
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cores_category ON cores(category);
CREATE INDEX IF NOT EXISTS idx_cores_author ON cores(author_id);
CREATE INDEX IF NOT EXISTS idx_cores_pricing_model ON cores(pricing_model);
CREATE INDEX IF NOT EXISTS idx_cores_rating ON cores(avg_rating);
CREATE INDEX IF NOT EXISTS idx_cores_installs ON cores(install_count);
CREATE INDEX IF NOT EXISTS idx_cores_name ON cores(name);
CREATE INDEX IF NOT EXISTS idx_cores_created ON cores(created_at DESC);

-- GIN index for JSONB manifest search (provides, requires, targets)
CREATE INDEX IF NOT EXISTS idx_cores_manifest_provides ON cores USING GIN ((manifest_json->'provides'));
CREATE INDEX IF NOT EXISTS idx_cores_manifest_requires ON cores USING GIN ((manifest_json->'requires'));
CREATE INDEX IF NOT EXISTS idx_cores_manifest_targets ON cores USING GIN ((manifest_json->'targets'));

CREATE INDEX IF NOT EXISTS idx_core_installations_core ON core_installations(core_id);
CREATE INDEX IF NOT EXISTS idx_core_installations_project ON core_installations(project_id);
CREATE INDEX IF NOT EXISTS idx_core_installations_agent ON core_installations(agent_id);

CREATE INDEX IF NOT EXISTS idx_core_reviews_core ON core_reviews(core_id);
CREATE INDEX IF NOT EXISTS idx_core_reviews_agent ON core_reviews(agent_id);
CREATE INDEX IF NOT EXISTS idx_core_reviews_rating ON core_reviews(rating);

-- Trigger to update avg_rating when reviews are added/updated
CREATE OR REPLACE FUNCTION update_core_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE cores
  SET avg_rating = (
    SELECT COALESCE(AVG(rating), 0)
    FROM core_reviews
    WHERE core_id = NEW.core_id
  ),
  updated_at = NOW()
  WHERE id = NEW.core_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_core_rating
AFTER INSERT OR UPDATE ON core_reviews
FOR EACH ROW
EXECUTE FUNCTION update_core_rating();

-- Trigger to update install_count when installations are added/removed
CREATE OR REPLACE FUNCTION update_core_install_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE cores
    SET install_count = install_count + 1,
        updated_at = NOW()
    WHERE id = NEW.core_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE cores
    SET install_count = GREATEST(0, install_count - 1),
        updated_at = NOW()
    WHERE id = OLD.core_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_core_install_count
AFTER INSERT OR DELETE ON core_installations
FOR EACH ROW
EXECUTE FUNCTION update_core_install_count();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_core_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cores_updated_at
BEFORE UPDATE ON cores
FOR EACH ROW
EXECUTE FUNCTION update_core_updated_at();
