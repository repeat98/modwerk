Octatrack base (USB, beta): when the Octatrack started and couldn't put back one of your kept modules, every sync after that was refused with "The Octatrack can't run this module file" until a restart brought all of them back. The base now counts only the modules that came back as your installed set, so you can sync again straight away, including the missing module. Your memory card keeps the full set until your next sync, so the next start still tries the missing module. Why the module was refused at the start (a tester's Ringmod SC) is still unknown. Beta base `109f23bd`.

A sync sent while the Octatrack was still saving your last change to its card was refused the same way. Now the site waits a moment and tries again.

The Octatrack page's Status now says so when not every saved module came back at startup; it used to say "Nothing saved on it yet". It also names a start with FUNC held and a saved set that couldn't be read.
