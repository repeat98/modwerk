SDK: `npm run modules:pairs` reads and writes its files as UTF-8 with LF line endings, so it no longer fails on Windows, where Python's default encoding is cp1252.
