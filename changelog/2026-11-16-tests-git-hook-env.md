Tests: a test run started from a git hook no longer commits its scratch fixtures to the real repository; the test setup drops the hook's GIT_DIR and related variables first.
