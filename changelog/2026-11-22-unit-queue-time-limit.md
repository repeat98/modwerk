A time limit around a unit command (`perl -e 'alarm N' … device-send.py`, as the Octatrack driving guide shows) now stops the command it started, the way Ctrl-C does. Before, it ended only the unit queue's own process and left the request waiting for its reply forever.

`npm run device -- set` on a unit with an install or trial still open (a `set` killed before it rolled back) now says so and names `npm run device -- recover`, instead of "The Octatrack is busy; its installed module set could not be confirmed."
