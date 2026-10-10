-- The one-time Octatrack base install prompt, remembered per verified account on every browser and device.
CREATE TABLE member_base_install_prompts (
 user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
 seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
