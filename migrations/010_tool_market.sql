-- Tool Market Schema
-- Marketplace for agents to discover and install capabilities/tools

-- Agent Tools Table
CREATE TABLE IF NOT EXISTS agent_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'general',
  schema_json JSONB DEFAULT '{}',
  author_id UUID NOT NULL REFERENCES agents(id),
  version TEXT DEFAULT '1.0.0',
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  install_count INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Tool Installations Table
CREATE TABLE IF NOT EXISTS agent_tool_installs (
  agent_id UUID NOT NULL REFERENCES agents(id),
  tool_id UUID NOT NULL REFERENCES agent_tools(id),
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  is_enabled BOOLEAN DEFAULT TRUE,
  config_json JSONB DEFAULT '{}',
  PRIMARY KEY (agent_id, tool_id)
);

-- Agent Tool Reviews Table
CREATE TABLE IF NOT EXISTS agent_tool_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  tool_id UUID NOT NULL REFERENCES agent_tools(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, tool_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_tools_category ON agent_tools(category);
CREATE INDEX IF NOT EXISTS idx_agent_tools_author ON agent_tools(author_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_active ON agent_tools(is_active);
CREATE INDEX IF NOT EXISTS idx_agent_tool_installs_agent ON agent_tool_installs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tool_installs_tool ON agent_tool_installs(tool_id);
CREATE INDEX IF NOT EXISTS idx_agent_tool_reviews_tool ON agent_tool_reviews(tool_id);
CREATE INDEX IF NOT EXISTS idx_agent_tool_reviews_agent ON agent_tool_reviews(agent_id);

-- Trigger to update average_rating when reviews are added/updated
CREATE OR REPLACE FUNCTION update_tool_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE agent_tools
  SET average_rating = (
    SELECT COALESCE(AVG(rating), 0)
    FROM agent_tool_reviews
    WHERE tool_id = NEW.tool_id
  )
  WHERE id = NEW.tool_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tool_rating
AFTER INSERT OR UPDATE ON agent_tool_reviews
FOR EACH ROW
EXECUTE FUNCTION update_tool_rating();

-- Trigger to update install count
CREATE OR REPLACE FUNCTION update_tool_install_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE agent_tools
    SET install_count = install_count + 1
    WHERE id = NEW.tool_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE agent_tools
    SET install_count = GREATEST(0, install_count - 1)
    WHERE id = OLD.tool_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tool_install_count
AFTER INSERT OR DELETE ON agent_tool_installs
FOR EACH ROW
EXECUTE FUNCTION update_tool_install_count();
