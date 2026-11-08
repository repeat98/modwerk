-- Expand the closed machine enum without changing existing totals or inventing historical attribution.
CREATE TABLE usage_device_daily_expanded (
  day TEXT NOT NULL,
  device TEXT NOT NULL CHECK(device IN ('octatrack','digitakt','digitone','digitakt-ii','analog-rytm-mkii')),
  builds INTEGER NOT NULL DEFAULT 0,
  builds_failed INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day,device)
);
INSERT INTO usage_device_daily_expanded SELECT day,device,builds,builds_failed,downloads FROM usage_device_daily;
DROP TABLE usage_device_daily;
ALTER TABLE usage_device_daily_expanded RENAME TO usage_device_daily;
INSERT INTO usage_meta(key,value) VALUES('machine_coverage_expanded',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT DO NOTHING;
