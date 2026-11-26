-- Count Model:Cycles core builds per machine, as 0083 did for the other local builders: widen the closed machine enum
-- without changing existing totals. It also lists digitone-ii, which 0102 (the Digitone II base) adds the same way, so the
-- two rebuilds apply in either order.
CREATE TABLE usage_device_daily_expanded (
  day TEXT NOT NULL,
  device TEXT NOT NULL CHECK(device IN ('octatrack','digitakt','digitone','digitakt-ii','analog-rytm-mkii','digitone-ii','model-cycles')),
  builds INTEGER NOT NULL DEFAULT 0,
  builds_failed INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day,device)
);
INSERT INTO usage_device_daily_expanded SELECT day,device,builds,builds_failed,downloads FROM usage_device_daily;
DROP TABLE usage_device_daily;
ALTER TABLE usage_device_daily_expanded RENAME TO usage_device_daily;
