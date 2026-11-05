"""FM SYNTH: Tim Hastie's FM engine, machine list and bundled scale quantizer (octatrick 2.21).

`upstream/synth` and `upstream/quantizer` are the author's files at bb784c4 (bb784c413d86cc6ef2a895f7291af46cb851065f, released as part of Octatrick 2.22 on top of v2.21 9e4d34a; 342c533 + poly.s: an FM SYNTH track's level is the engine's, its slot's GAIN attribute ignored; 342c533 = 4d25490 + poly.s: an FM SYNTH track whose FOLLOW is OFF reads the scale as OFF), byte for byte: release
2.21's engine and machine list, his quantizer with the per-track switches as the SEQUENCER rows TRACK
and FOLLOW (8f6f564, the source Scale Quantizer 0.1.4 carries), and poly.s exporting the engine state
the quantizer's panel transaction reads in a remix without SY DRUM (4d25490; no code byte changes).
This wrapper adds only what the Modwerk build needs:

- Stock guards in Modwerk's form: `stock_guard(address, length, sha256)` for every site the
  author's manifests guard and this module patches, committed below (and listed in
  `stock-guards.json`). The author's manifests read hook spans through their own `stock_guard.py`
  (address and length, from the local OS section); here that reader is answered from this table,
  so a checkout without firmware declares the same digests, and reading a span checks it against
  the developer's own verified 1.40C image (fail closed). A site the table does not name refuses
  the declaration.
- The bundled quantizer's detour and poke guards restated by address, length and digest
  (`_QZ_GUARDS`); its manifest's reads are answered from this table, and each of those sites is
  declared with it.
- Seven of the author's hooks left out (`_DROPPED`), as agreed with Jannik Aßfalg on #555:
  the bundled quantizer's seven hooks on MIDI tracks and on sample tracks (qz_mknob, qz_mplock,
  qz_mkey, qz_mnote, qz_mprev, qz_atrig, qz_heldmark: Scale Quantizer's job; FM tracks keep their
  quantizing in the engine). The author's manifests still read those spans while they build their
  tables, so `_READ_ONLY` answers the reads; nothing declares or patches them. The LFO SETUP
  names hook po_lfdname (0x4003bff2, 8 bytes) is in the card build again: since the base's #1080
  ot_machines owns that whole 8-byte site, so the hook is listed under the ot_machines
  contribution's `replaces` (machine-ports.json; Jannik Aßfalg, #555, 30 October 2026) -- a card
  build, which has no base, keeps the detour, and a USB package would drop it for the table.
- SEQUENCER: SCALE, ROOT and GLIDE after the stock three (`_SEQ_ROWS`); the author's TRACK and
  FOLLOW rows are left out of the tables and the row count.
- Beside Scale Quantizer, which carries the same quantizer source, this module is a declared conflict
  (octamod.module.json): both would patch the same sites, and a module may not hook into another
  module's code, rows, tables or files (the owner, #555, 31 October 2026).
- The quantizer bundled privately, its units renamed `fm_*`, as in earlier FM Synth releases.
- Each unit's generated `remix.inc` as the author writes it for a remix without SY DRUM and
  without Mute Modes, with the bundled quantizer counted as present: FM Synth installs alone on
  Modwerk (no cross-module symbols), and its engine and its quantizer are one module, so the
  author's panel transaction (2.21, HAVE_PANEL_TRANSACTION) is assembled in both. The author's
  trig-mute rule (2.19, poly.s po_mm_*) is assembled and reads two words of port.s, which the
  base's raised event ev_trig_muted (Modwerk #912) fills over USB; with no answer (a card build, a
  base without the event) they stay 0 and every trig plays.
- `conflicts` cleared: Modwerk declares conflicts in octamod.module.json.
- `port.s`: the machine record's callbacks for the Octatrack base (machine-ports.json); card
  builds never call them. Its admit_track, assign and ui_tick run the author's own guard and
  machine change (machine.s ml_guard_p, ml_toast, fm_choose, ml_reset), so those three local
  routines are exported from the fmmachine unit's object (Linked.exports; no code byte changes).
- `sy_state`: the bundled quantizer's panel transaction reads it; since 4d25490 the author's poly.s
  exports it whenever that transaction is assembled, so this wrapper no longer does.

Since 2.21 the author's own manifest links the PLAYBACK page as a DRAM unit (page.s, compared
with the page he ratified at its historical address by length and SHA-256) and keeps the 16
bytes the stock DELAY reads past its table stock: Jannik Aßfalg's #895, which 0.1.4 carried in
this wrapper for 2.20, is now the author's.
"""
import contextlib
import dataclasses
import importlib.machinery
import importlib.util
import pathlib
import runpy
from collections.abc import Mapping

from remix import stock_guard as _modwerk_guard
from remix.stock_guard import LocalStockSpan, stock_guard
from remix.schema import Category, Linked, Proof

_HERE = pathlib.Path(__file__).resolve().parent
_REL = lambda path: str((_HERE / path).relative_to(pathlib.Path.cwd()))

# Every stock span the author's synth manifest guards through stock_guard.py and this module
# patches (address, length, SHA-256 of the original 1.40C bytes).
_GUARDS = (
    stock_guard(0x40002318, 8, '3d25d06bf11f3a7bccef894d0016b52adbb4ae468a0f475dd497d7b5966e2694'),
    stock_guard(0x40003ca4, 8, 'affe75cc6a50fffd392b3e1045e18d0fbf846ff2f30fe75be1e445e634f96cf9'),
    stock_guard(0x4000685c, 6, '98e9488a15bc1e186e25540bc49839ccd37ffcb4a835ab2c26ec17362380b922'),
    stock_guard(0x4000b51a, 8, '4aec4ef01824a0bd3e42321ef4c36e0fd1e2003924c72308dfa8bc1db84d38fc'),
    stock_guard(0x4000b540, 14, '507bb78c096bfeb6a0224b825011bbf15a89fa0fcf5f2826060ab6d4cb1808a0'),
    stock_guard(0x4000b906, 6, '9f549a756fd0c38d93b55ce353f6e8194a52556877e08f90eb4e420a374144bc'),
    stock_guard(0x4000bafe, 8, '9127ff5b8f4845a81a10deda9554796ba9ed6501e08ce308b04f046b3bc50d74'),
    stock_guard(0x4000bd74, 6, 'b05db0e2c6e818a323c3e72cc9a8a5070faf9d4fff1106356df02553a940850b'),
    stock_guard(0x4000bdc0, 6, 'b05db0e2c6e818a323c3e72cc9a8a5070faf9d4fff1106356df02553a940850b'),
    stock_guard(0x4000be4e, 6, 'b05db0e2c6e818a323c3e72cc9a8a5070faf9d4fff1106356df02553a940850b'),
    stock_guard(0x4000c422, 6, '38745d184855ca6e210f5229966abac017f1f536d9224187b2a42bed756560a5'),
    stock_guard(0x4000c62e, 6, 'b05db0e2c6e818a323c3e72cc9a8a5070faf9d4fff1106356df02553a940850b'),
    stock_guard(0x4000c634, 8, '59609fac3f03905ee63fde6f557553d44e997fc6e02eb6c8aa4c475715ff2662'),
    stock_guard(0x4000cb2a, 8, '7150e97a25c00e0740c0e5a992f5b64c98ac2d0747dba074a0d17c6209049654'),
    stock_guard(0x4000d03e, 8, 'affe75cc6a50fffd392b3e1045e18d0fbf846ff2f30fe75be1e445e634f96cf9'),
    stock_guard(0x4000d514, 8, '39173055fb04ac0a6c355f89561b48834bc5b31ad67609e3fe53efbff7de1866'),
    stock_guard(0x4000de10, 6, '4a1708d81bb2f20ab51c41d28145e52f09c94f248bbdde8e63a7f08524734e89'),
    stock_guard(0x4000dfd4, 8, '85d5478797bd0d879fe58aa4de88956a8f8fbacdd65ac8faa8a28da95e9c14f4'),
    stock_guard(0x4000e452, 8, '1e3f89d63562977cf6928c72536e014118c40df97d7f5f3d80c78b10ed4c0448'),
    stock_guard(0x4000e746, 6, 'c1891b97a86df058cd89d4808e381ecdcf3303e96b08c5e0fd525ea46ffe4d69'),
    stock_guard(0x40022686, 6, 'ffcc36e1a4e00547dfdf889bb0fa8d8eccd4ca4166d097f5f79689712cd0cb07'),
    stock_guard(0x40022732, 6, '1828d38aca11808e502a8f12cd4843db42612d2a1317d5ed1225d617cfc5b5e4'),
    stock_guard(0x40022c16, 6, '503cc83327f17ac270360f256196789c6cf7a061489249142f90cabf7bed632f'),
    stock_guard(0x40025b40, 8, '9763fb611c807f5dc904f9b5ee15ae74bda1e39d0f9e46671289a147cd2daaa7'),
    stock_guard(0x40026768, 6, '1f78fbfb9a5a1d1d0517417369c81f72056176e41d1cb3e803cd8088b94455a9'),
    stock_guard(0x4002689c, 8, '1a241bd7b3090391ae8bfc0352ae22425a70817ccd477fa5d7aba231b95b8bc9'),
    stock_guard(0x40026990, 8, '1a241bd7b3090391ae8bfc0352ae22425a70817ccd477fa5d7aba231b95b8bc9'),
    stock_guard(0x40026eb0, 10, '1026d523a4f46be54546a3e5b42d970c6847f7899b5a007cccd51216361d6d11'),
    stock_guard(0x40026ef0, 8, '4c6de0100c3e5eb1e6fc9b7e0d99266f375aef1318b8e3757199f2924e182e85'),
    stock_guard(0x400274cc, 8, '8b8eecab0202d28022d5b80024c3466614778f97f96559a0b5800208223c02b8'),
    stock_guard(0x400275a0, 8, '8b8eecab0202d28022d5b80024c3466614778f97f96559a0b5800208223c02b8'),
    stock_guard(0x40027e98, 10, 'dff673c3c1fbc3335a73a0b82f36b1c022998ac132231525c8c5e1c510769423'),
    stock_guard(0x400292a0, 8, '4c6de0100c3e5eb1e6fc9b7e0d99266f375aef1318b8e3757199f2924e182e85'),
    stock_guard(0x4002932c, 8, '743e1bacef08067f54b2319ccdab132e95564eea77d93af633637e5370b08367'),
    stock_guard(0x400294c0, 8, 'aafc8f979f6aeb11a4358bcf7b01706892acebe4c40d3e520f88528b3cac80a8'),
    stock_guard(0x40029754, 8, '57ce6a873a72d55110bfba4569069ecc773810ea4134eb9191e9c6c1ccaa0714'),
    stock_guard(0x40029a4c, 8, 'ba7573adceae0b4d98e7fca043628b41525f9bf3ec50663e051c89a57a79cb35'),
    stock_guard(0x40029b54, 10, '8f8179aad723434887795caa8f7046c6442e836752597d48967cb9982512a35f'),
    stock_guard(0x40029b8a, 10, '2b791fa92efd34d8dc1b41b38dc81aa449a7c58e42e53643186e23de35452f7c'),
    stock_guard(0x4002a38c, 8, '9d8b5c6fa44fca2b22f8cb24de82782737e5615dff673baad1c7423135d0d27f'),
    stock_guard(0x4002aefc, 8, '9763fb611c807f5dc904f9b5ee15ae74bda1e39d0f9e46671289a147cd2daaa7'),
    stock_guard(0x4002b450, 6, '8521e13dbb173ca0918443c83caf86ae18f86aefdb67d09dfbfa23f822053fe8'),
    stock_guard(0x4002b654, 8, '3e7c95b32f444fd280cb96b2a6ea90525fe223d6e6b9352086d2cf41941ae854'),
    stock_guard(0x4002b962, 10, 'e4f5ebd25db499cae9f17bec1f36d67632e0839b504aef99abda483ee50cbcd7'),
    stock_guard(0x4002b99e, 10, '135afcbe5b8a8ea6b91526d43024681a8fbbfa1f84b93443ba10fa29c9933e98'),
    stock_guard(0x4002b9b0, 8, 'efa23c0a55aebcd8ffb29c8ba97d3970d8e88ed9c16272d7b5ea0b4e8309ecf5'),
    stock_guard(0x4002bf38, 8, '2f00d9fdb64f51c6d0127dfa877aafe06a2b563333fd0cf980219fbddab7e663'),
    stock_guard(0x4002cb92, 8, '4c84d29db6ad3c55ff49e18d8710dd799b0a217a3fdf31ff931161ab4072749c'),
    stock_guard(0x40031e62, 8, 'e959e9faafc44ea9c6bfdd092ecc23526495873cc4bb235455ee04d45d4c7c4b'),
    stock_guard(0x40031ece, 6, '5aed68f7498659f87e414631493741e91f3442c5319f46e6893b567c423ce24f'),
    stock_guard(0x400334d8, 6, 'd6c9f1f60272197a17511f496fc19dd21ddd7df5f1f1ec0cab7a16cad60b0609'),
    stock_guard(0x40033aac, 8, 'f104315925f98abf6c188a4f4a881e112b5853119a570e5c603d34432837fe39'),
    stock_guard(0x40033b32, 8, '185186ff675407f6190e294d2b11a5ff985e5bee7c7485d7678db0be97893c10'),
    stock_guard(0x4003685a, 12, '9d2d6a8b11265cf919a3cf246ebf74e7ff2379d1ce4b15b310edffed55f665fb'),
    stock_guard(0x400368ac, 12, 'b1ae4e00765b28aecf9f4e1be20a3a2b0ef1def51a5e47acbb01d84804231cbc'),
    stock_guard(0x40036946, 12, 'b1ae4e00765b28aecf9f4e1be20a3a2b0ef1def51a5e47acbb01d84804231cbc'),
    stock_guard(0x400388a8, 8, 'f43e013ef43cd87b96b92b3069a52bdd86f668da5abc30168cca144d58c0261d'),
    stock_guard(0x40038b06, 8, 'f1c88be8c97ae96dc5e8f024c7dac1e5eabc1abb0fa1dc26d1c142522f7a3a65'),
    stock_guard(0x40038c30, 8, 'dc335d0aed0cc4febec4501776825159505f5b413de340f6e74208856577c47b'),
    stock_guard(0x40039020, 6, 'ee728844d0a5aad1f72daaa0980b1b57751717806917c7351f055299a16309e1'),
    stock_guard(0x400392cc, 8, 'a57855f641d419b81f08ce2f502a1bf18363df142106b0b0ab926fc65b1c0948'),
    stock_guard(0x400398b4, 8, '52dccc03e103dca3839c839017cffce1d4a1e675d8dfb2804764141e86c63841'),
    stock_guard(0x40039df4, 8, '0c6d3f0bfd198ddc78800e6503eccdc6cbc5c442209d882244584eda864e93ca'),
    stock_guard(0x4003a45c, 6, '59d18aebd5e0181b5559da16c7573710e1be845ea44475e1b4a175eb58e5719e'),
    stock_guard(0x4003a52e, 8, 'cae34bf50383462ed4f92d8044e3021247edb8bf69c17a9c7ead62f6edf79510'),
    stock_guard(0x4003bff2, 8, '646fea5c7ac7852156feed7591534de986df92af53074c25ecf54e4295d072ae'),
    stock_guard(0x4003a614, 10, 'ad14a643a51b28ae439d5e7d2988b9e42dd2b973b4e1a2ae230b8a6ecd99435f'),
    stock_guard(0x4003ae40, 12, '3e401f14e70d67d18fcec37faf084580fd6bfa25426424788fe2828eb89f5c53'),
    stock_guard(0x4003af0a, 10, 'd248085685bfc02ef8676cdf2e954840efc741ef3957382256f9dbd35c208e65'),
    stock_guard(0x4003c928, 6, '237cd1acd4da7acb61dc7fda7c88e648a5186b36732f433b4dd91966c5a669af'),
    stock_guard(0x4003c950, 6, '6fa1f2f2fc3d83f1e1917364e374491dd04fc060d1beea8b77f03bdd332e2b75'),
    stock_guard(0x4003c980, 6, '237e017ccd95444195ca390a3e6ca6076fbfa1f0931f2e7dfbdbee8c5ec72ca3'),
    stock_guard(0x4003cd98, 8, 'ed71ef874312890edc87cef7e19cd8c0f8ac4ac9b90182c2364f78d3a4567f45'),
    stock_guard(0x4003d718, 6, '53b8d23acf2c3fe0f794c0a5f37475b17c3433bc6a466e0e1861515989cfecda'),
    stock_guard(0x4003d916, 8, 'd76f469591191c1c7b41715238acb38172b1f7be3d1d07d862a2d46fe53ca2e1'),
    stock_guard(0x40040e14, 8, '52dccc03e103dca3839c839017cffce1d4a1e675d8dfb2804764141e86c63841'),
    stock_guard(0x400434c4, 6, '0ff22553d534e9be32c14bd6cb02ad1378cfb321ae4aa0e855bad36a05582342'),
    stock_guard(0x4004a908, 8, 'a04973fb79ed0896aa768e97902a85f61a10ad9d106955b3fe7a112c76d0e51f'),
    stock_guard(0x4004a9d0, 8, '9b78b6778f56449ca9429e734d2140df96316ae0e9eea0b9d6eea089f82ddbd0'),
    stock_guard(0x4004aab4, 8, 'b135c3d26b1fe44c606ada1d8c7b28ee8977c8b535504950904bcaa790480122'),
    stock_guard(0x4005040c, 8, '82f9c301aead4e1a90d91f8f679ba9cb91d05c1ed69dcc1c270dc59485285f1e'),
    stock_guard(0x400508e4, 8, '2207fffe6c6df168aa44f4d606cde43662645ed9419bdd8f89b00259d5778c93'),
    stock_guard(0x40050fd6, 6, 'a56b367231e7d77a7c24613c65d499e76fae9c1b1a0cec40037b6e7bf0b437d8'),
    stock_guard(0x40051fce, 6, '48029903d5d445adefcbc67dd2771ecaeac44c1000bfa1743f16f1665ed837ca'),
    stock_guard(0x4005221e, 10, '8f0fa4f7d6db857f695996b185b38b788fa6af0eacd86d7dd01e2ff61201ffed'),
    stock_guard(0x4005224a, 8, '1f32afe109a68799b4ab5f3772a8ffd7f113cee714374eda804945044d91fe3d'),
    stock_guard(0x40052e98, 8, '14607b32e7a5a2eae6fcb2e63e1770b2f2387c64c63e6289faf0eb8e75f9aa40'),
    stock_guard(0x40053498, 8, '9d8b5c6fa44fca2b22f8cb24de82782737e5615dff673baad1c7423135d0d27f'),
    stock_guard(0x40053a68, 8, '52dccc03e103dca3839c839017cffce1d4a1e675d8dfb2804764141e86c63841'),
    stock_guard(0x4005435c, 8, 'dc335d0aed0cc4febec4501776825159505f5b413de340f6e74208856577c47b'),
    stock_guard(0x40054cca, 6, 'afad0d9908862e673b0130a710d92307779db90afc4d4f985f7cc058a5b9f1a9'),
    stock_guard(0x400574cc, 6, '64a6b796a6016b763730f7bb2d5f041bac90b1db7ab3740f2d2ce13a027f6a5a'),
    stock_guard(0x40058488, 6, '59d18aebd5e0181b5559da16c7573710e1be845ea44475e1b4a175eb58e5719e'),
    stock_guard(0x400585dc, 10, '22fb6e2bea4520003d2fae7035c0cd57bcd6fe6f2cfdd5b70580a3f6f2a68034'),
    stock_guard(0x400585fa, 8, '28992093b4deda97ffa595ce8acd14c8a2a391c67871c1e8dd3421d97467a29d'),
    stock_guard(0x40059d56, 6, '6e1b853823706fee366208281c3d01a27c06e219d8ff5e6145b06a450e3e25fa'),
    stock_guard(0x4005a616, 6, '7a7350a69423ec41ec468a189ba167059626cb7f499d9862394d2388a23c8b59'),
    stock_guard(0x4005a848, 8, '0e7c7d36b68c48dceaae800ce1f22cbac9a888c121739368ba12458bab9cbe93'),
    stock_guard(0x4005a850, 6, '7a7350a69423ec41ec468a189ba167059626cb7f499d9862394d2388a23c8b59'),
    stock_guard(0x4005fbd2, 6, 'a56b367231e7d77a7c24613c65d499e76fae9c1b1a0cec40037b6e7bf0b437d8'),
    stock_guard(0x400603f2, 6, 'd317798a5e6f5ff9e9d75b8f659bd29463e1f73689d72c532df8029adfa081ba'),
    stock_guard(0x400625e0, 10, '5c6bbcd0f1e2dd2ae81a5e24e88e3b98e08a127430e90904a746d7eaaac10004'),
    stock_guard(0x4006262a, 10, '77eaafa68e06beb974f9ba8fec19804e7601a2e326dbdf2aa5a6a62341741898'),
    stock_guard(0x40078678, 12, 'd0853f882affa9f487c3a82a5e08c3b3bc4c3082692c8af90dd2949eb191a733'),
    stock_guard(0x400786c8, 6, 'c611970befafba97f882ab297bd19f0efe0c7d927bfd6110c53f03ad4b7da1c7'),
    stock_guard(0x400786ce, 6, '2c62e6999a40a15016ea1fe57b7ca93f9d4fe1558127921ae736814a30b5455b'),
    stock_guard(0x40078886, 10, 'fe6cb52458c7d968dc467c1cd7721d832baf6bc2fac1826c8c10ed07fee2e7f8'),
    stock_guard(0x400788c4, 8, '01e9efce3c63827f376982d19c8eae4a2d894e473b4bc6813c5cf72833ee44d5'),
    stock_guard(0x40078c22, 8, 'd749208f2ebf1e144a87c325281e533ef582759f54549234fcc92c90dc89a595'),
    stock_guard(0x40078cb0, 8, 'd749208f2ebf1e144a87c325281e533ef582759f54549234fcc92c90dc89a595'),
    stock_guard(0x40078d2e, 8, 'd749208f2ebf1e144a87c325281e533ef582759f54549234fcc92c90dc89a595'),
    stock_guard(0x40078dee, 8, 'd749208f2ebf1e144a87c325281e533ef582759f54549234fcc92c90dc89a595'),
    stock_guard(0x40078e7c, 8, 'd749208f2ebf1e144a87c325281e533ef582759f54549234fcc92c90dc89a595'),
    stock_guard(0x40079248, 8, '3ec3e33dc9eae9cfbe075a2a5e2697563293203896e3649ae7e7a718a6d7f34c'),
    stock_guard(0x400795ba, 8, '246f05f28fccbec27678548be76fabfb68813a155739cc82b928cb08f35dbb52'),
    stock_guard(0x40079816, 8, '45a9bc540eb5c34d7b8a12fa454a789212fdb4130e252b4e2b9d54f75849b0e3'),
    stock_guard(0x40079904, 8, '845ca10fcd33861c3a74cd9bb5f9da1fd78bb0cf44e30f2fc0ae43db045a633e'),
    stock_guard(0x4008485e, 6, '0bc2ef188c68224486591693fb94e822b6cc59b94e31323c678457ef5363120e'),
    stock_guard(0x4008ec4c, 8, 'd2d2ad55cf4a4dffa571fd968940e80d2baadc54b64ae62376a41653870f3755'),
    stock_guard(0x4008eda4, 8, 'da4b8bf41daeba784e24ed3a16d4ef7c5f6397ee3db9e47c007b1022b395d2b9'),
    stock_guard(0x4008ee74, 8, '7d5c431d467d3f7e6d9e050e69120eb7faae9c6eede0a0b6c5a8e01f12a224cc'),
    stock_guard(0x4008f0b0, 8, 'da4b8bf41daeba784e24ed3a16d4ef7c5f6397ee3db9e47c007b1022b395d2b9'),
    stock_guard(0x4008f180, 8, '7d5c431d467d3f7e6d9e050e69120eb7faae9c6eede0a0b6c5a8e01f12a224cc'),
    stock_guard(0x400905d4, 8, '604756f90fe2564cd1c75b712a1c239b10ef2db438579e307632b3382bacd165'),
    stock_guard(0x400909d8, 10, '04b9d7a74c6bd182603087f929a77f363eac1667a5135d86b8fda1c6d35d9b82'),
    stock_guard(0x400912c4, 8, 'ef3b763ec7fe48e228294def257018f5a1753bd89854058291f5ed24af485e1d'),
    stock_guard(0x400917c8, 8, 'b692e058a2f3049810c18b0571d61c085c3daba589a09b531fed42f528b96012'),
    stock_guard(0x400919e4, 8, '74c5c24f09bf544b8fad303723b3935f248a9f48eefdbd230049cf63bd8fee5e'),
    stock_guard(0x40096d22, 12, 'b5012d4696413cb225088c0d29838af23260cf54146fc48f5cfddfe19c1e10ef'),
    stock_guard(0x4009a664, 8, '2effba8e990d9a5e8d0ccefb64ff38bff78d39b97a08de89d32a809d669697ce'),
    stock_guard(0x4009b220, 8, '04c6b670df9acf88738d96b42b425126ef6eb1b19681ddbad2f9a6aa460f881a'),
    stock_guard(0x4009b86e, 6, '280015090fac9b58d39bf5bcd9f920fcbab7973643dbf5ce8300be5098b299c7'),
    stock_guard(0x4009c04e, 6, '280015090fac9b58d39bf5bcd9f920fcbab7973643dbf5ce8300be5098b299c7'),
    stock_guard(0x4009c8bc, 8, 'e398ae4718aa25b1a93c5bce98f6ab1c42cf49239c934a30b67dee219734f4a9'),
    stock_guard(0x4009d1e8, 8, '9921e7a2179ac4fdb8cde53f686de2defea4b78e13c5a2c3e88958b635063458'),
    stock_guard(0x4009d39e, 8, '65b427004cad9ff6b83cd000147daf500848cd9b33cf89eb948bdcf4be58e266'),
    stock_guard(0x400d24d0, 16, '374708fff7719dd5979ec875d56cd2286f6d3cf7ec317a3b25632aab28ec37bb'),
)
# The bundled quantizer's detours and its SEQUENCER row-count poke, restated by address, length and
# digest: they answer its manifest's stock_guard(site, length) reads and declare those sites.
_QZ_GUARDS = (
    stock_guard(0x40005162, 8, '71fcb998fdf55a8ba0425d107c73e4e5b843fc1b8d75baba2a081207d1306e73'),
    stock_guard(0x40010212, 6, '8728078b48ce7f9e9ac9b2d41c454e293ecc0dc4af302ea1885264064442c9e4'),
    stock_guard(0x40025ac2, 6, '46484a409ff4c92ca7811222b2a050a935c53122a69184d8a18db71d69820ca9'),
    stock_guard(0x40044968, 8, 'd6d1c7b3caf3215f6590e479a282b5c09d27c1d52c221d596ba9c7fa293896e9'),
    stock_guard(0x400449be, 8, '494435e3f72313a14453f642bdba5b064022c657c63c015752fe23092eabd19f'),
    stock_guard(0x40045918, 8, '112b7d2434bae65950506429fa2e8d01b20316d7ab6d1848ba91f10c451e11ac'),
    stock_guard(0x4004fbde, 6, '7daba4e508057c5320565e7ccc62d4e55d0fa501b0c2586445df51ff9503b3de'),
    stock_guard(0x4004fbfe, 8, 'f974dcd132df96148fe8c38e662bf638aba29290a8ca4467402e8ac707eba123'),
    stock_guard(0x4004fc58, 10, 'ddfca03eed59b4f4fffffc9061b138ce3e2a33c30712b5e377d94d054fa7b0f0'),
    stock_guard(0x4004fc84, 16, '567a08a47bfcfcbfa686446f812f7d8047929e38330c65d76598eb47e2c4c511'),
    stock_guard(0x4004fc94, 8, '617ecbc4d5386f7ed57bfdc6e37dd7a1e1cc60850934d5c635ead626999e847e'),
    stock_guard(0x4004fce0, 8, 'e31f7bb195174d49c320879317409c3d2187cc42f337ac0845f41acaebf509bf'),
    stock_guard(0x4004fd06, 6, 'c8e4de3e3a3d28c808f812c9316fd22097f36ec2afb558ef6b81b2a8d66cebe7'),
    stock_guard(0x4004fd20, 6, '902ec18f60fbd1fe19c6a380f31a74290976edd45422b224a3905d550636c94f'),
    stock_guard(0x40050254, 8, 'cee8c24bcad796ec96a96aad2d0073265ca9900179292d7c1c942604aeafd8c3'),
    stock_guard(0x40050e60, 10, 'ccf689e403ebd88a651c829b4ae191d609c85baa2a99409bd0a2870d20aaa73e'),
    stock_guard(0x40055170, 6, 'dc6543d672cdf223fc2ec7cc3c04b8a584dbd6e7bb1e3590b91cd3e469e0b324'),
    stock_guard(0x40065bca, 6, '484a241b3cea4a13c5b18550e3ab44eaffc021673bd5677a424bb05cc6486a37'),
    stock_guard(0x40065c7c, 4, 'a3e547e08c1f288e512f2e52ac9becc3502ccd0dcfcf55e5ab9863859f34e2bc'),
    stock_guard(0x400866cc, 8, 'de4845a149f0373201be2e55cd61ae41f52a03afd7c4cb717b70d9c6bd64c5ad'),
    stock_guard(0x400867a2, 8, '51d1dc3c3bf8d2441df47bad2355b22c942d333b44557d35171c891cb573f3fb'),
    stock_guard(0x400888aa, 8, 'ef2b6bc9ba56b8cd1d05117b22c2fafc71e1aa07952c0999da4d4eb54e0489e6'),
)
# The spans of the hooks this module leaves out (_DROPPED), read by the author's manifests while
# they build their tables: answered here, declared by nothing, never patched.
_READ_ONLY = (
    stock_guard(0x4000c614, 6, 'e6abfb8463d2d93e458a247a07c80f477d3f2f616b85cf98f6cd828a433ae057'),
    stock_guard(0x400436a8, 10, '2ab0a5529e7748a00dea86e66bc4fbb6105ec7f36e73e481bb840f6570da98cc'),
    stock_guard(0x400439d6, 8, '53d90093082490eb3a630e3e0afba99946d22a720a84bae7194f11e091224777'),
    stock_guard(0x40044abc, 8, 'd789a426f2ed177607e8d6f5ecbf4618283211fa07df645bb7a2848ef7187ef0'),
    stock_guard(0x40050b98, 10, '9cb4af08e685b7a46a08340cfec555868a0568533c1fb6fc2ec37159dfd980d9'),
    stock_guard(0x40055382, 8, '03bcaf390b2fd396821abc005afa9853b59e2fcaf10ddc223c001b3a9d276e08'),
    stock_guard(0x4009fb80, 6, 'f444ba9960a8167cb9947f3acfc4a0fd2520327d61c57726ec33c7704307d59c'),
)
_BY_SPAN = {(g.address, g.length): g for g in _GUARDS + _QZ_GUARDS + _READ_ONLY}
_QZ_BY_SITE = {g.address: g for g in _QZ_GUARDS}

# The author's hooks this module leaves out: {unit label in his manifest: {symbol: site}}.
_DROPPED = {
    'qz': {'qz_mknob': 0x40055382, 'qz_mplock': 0x40050b98, 'qz_mkey': 0x400436a8, 'qz_mnote': 0x4009fb80,
           'qz_mprev': 0x400439d6, 'qz_atrig': 0x4000c614, 'qz_heldmark': 0x40044abc},
    'poly': {},
}
if {g.address for g in _READ_ONLY} != {site for hooks in _DROPPED.values() for site in hooks.values()}:
    raise ValueError('FM Synth: _READ_ONLY answers exactly the dropped hooks\' reads')

# SEQUENCER: the stock three rows, then SCALE, ROOT and GLIDE (the first three entries the
# author's tables add); his row-count poke, pea of 3 + 5 rows, becomes pea of 3 + 3.
_SEQ_ROWS = 3
_PEA_W = bytes.fromhex('4878')                  # pea (xxx).w: the row count's push
_SEQ_COUNT = (_PEA_W + (3 + 5).to_bytes(2, 'big'), _PEA_W + (3 + _SEQ_ROWS).to_bytes(2, 'big'))


def _guard(site, length):
    """The author's stock_guard(site, length), answered with this module's declared guard."""
    try:
        return _BY_SPAN[(site, length)]
    except KeyError:
        raise ValueError('FM Synth declares no stock guard for %#010x + %d' % (site, length)) from None


class _GuardLoader:
    def create_module(self, spec):
        return None

    def exec_module(self, module):
        module.BASE = _modwerk_guard.BASE
        module.stock_guard = _guard


@contextlib.contextmanager
def _author_guards():
    """Answer the author's `stock_guard.py` loads (synth and quantizer) with _guard."""
    readers = {str((_HERE / 'upstream' / folder / 'stock_guard.py').resolve()) for folder in ('synth', 'quantizer')}
    real = importlib.util.spec_from_file_location

    def spec(name, location=None, *args, **kwargs):
        if location is not None and str(pathlib.Path(location).resolve()) in readers:
            return importlib.machinery.ModuleSpec(name, _GuardLoader(), origin=str(location))
        return real(name, location, *args, **kwargs)

    importlib.util.spec_from_file_location = spec
    try:
        yield
    finally:
        importlib.util.spec_from_file_location = real


class _Alone(Mapping):
    """The remix as FM Synth's units see it on Modwerk: without SY DRUM and Mute Modes, and with
    the author's engine and quantizer both present, since this module carries both."""
    HIDDEN = ('SY DRUM', 'MUTE_MODES')
    BUNDLED = ('SYNTH MACHINE', 'SCALE QUANTIZER')

    def __init__(self, modules):
        self._modules = modules

    def __getitem__(self, key):
        if key in self.HIDDEN:
            raise KeyError(key)
        if key in self.BUNDLED:
            return self._modules.get(key)
        return self._modules[key]

    def __iter__(self):
        yield from self.BUNDLED
        yield from (key for key in self._modules if key not in self.HIDDEN and key not in self.BUNDLED)

    def __len__(self):
        return sum(1 for _ in self)


_PANEL_ON = '.set HAVE_PANEL_TRANSACTION, 1\n'


def _alone(include):
    """A quantizer unit's remix.inc, as _Alone sees the remix."""
    if include is None:
        return None

    def text(modules, include=include):
        value = include(_Alone(modules))
        if 'HAVE_PANEL_TRANSACTION' in value and _PANEL_ON not in value:
            raise ValueError('FM Synth: the bundled quantizer\'s remix.inc leaves the panel transaction out')
        return value
    return text


_NO_MUTE = '.set HAVE_MUTE_MODES, 0\n'
_MUTED = ('.set HAVE_MUTE_MODES, 1\n'
          '.set MM_MODE, fm_mm_mode\n'       # port.s: 0, or 2 while the base's ev_trig_muted answers
          '.set MM_STATE, fm_mm_state\n')    # port.s: the answer's tracks as mute bits 8 + t


def _unit_include(include):
    """A synth unit's remix.inc, as _Alone sees the remix, with the author's trig-mute rule (2.19,
    poly.s po_mm_*) reading the two words port.s keeps from the base's raised event ev_trig_muted,
    not another module's words."""
    if include is None:
        return None

    def text(modules, include=include):
        value = include(_Alone(modules))
        if value.count(_NO_MUTE) > 1:
            raise ValueError('FM Synth: the author\'s remix.inc names HAVE_MUTE_MODES twice')
        if 'HAVE_PANEL_TRANSACTION' in value and _PANEL_ON not in value:
            raise ValueError('FM Synth: the author\'s remix.inc leaves the panel transaction out')
        return value.replace(_NO_MUTE, _MUTED)
    return text


def _without(detours, unit, hooks):
    """The author's detours less the dropped hooks of one unit, each found once at its site."""
    for symbol, site in hooks.items():
        if sum(d.unit == unit and d.symbol == symbol and d.site == site for d in detours) != 1:
            raise ValueError('FM Synth: the author\'s %s no longer has one %s at %#010x' % (unit, symbol, site))
    return tuple(d for d in detours if not (d.unit == unit and d.symbol in hooks))


def _rows(table):
    """A SEQUENCER table with SCALE, ROOT and GLIDE only."""
    if not table.label.startswith('SEQUENCER ') or table.count != 3 or len(table.symbols) < _SEQ_ROWS:
        raise ValueError('FM Synth: the bundled quantizer\'s %s is not the SEQUENCER table it was' % table.label)
    return dataclasses.replace(table, symbols=table.symbols[:_SEQ_ROWS])


def _count(poke):
    if poke.addr != 0x40065c7c or poke.write != _SEQ_COUNT[0]:
        raise ValueError('FM Synth: the bundled quantizer\'s SEQUENCER row count is not the poke it was')
    return dataclasses.replace(poke, write=_SEQ_COUNT[1],
                               note='SEQUENCER window: 3 -> 6 rows (SCALE, ROOT, GLIDE; 3 visible, scrolls)')


with _author_guards():
    _UP = runpy.run_path(str(_HERE / 'upstream/synth/manifest.py'))
    _QZ = runpy.run_path(str(_HERE / 'upstream/quantizer/manifest.py'))['MODULE']
_SY = _UP['MODULE']

# Package labels are unique across the source catalog. These private copies
# retain the upstream symbols and fixed mailbox, but never alias public QZ objects.
_QL = {u.label: 'fm_' + u.label for u in _QZ.linked}
_QZ = dataclasses.replace(_QZ,
    linked=tuple(dataclasses.replace(u, label=_QL[u.label], include=_alone(u.include)) for u in _QZ.linked),
    detours=tuple(dataclasses.replace(d, unit=_QL[d.unit], **({'expect': _QZ_BY_SITE[d.site]} if d.site in _QZ_BY_SITE else {}))
                  for d in _without(_QZ.detours, 'qz', _DROPPED['qz'])),
    pokes=tuple(dataclasses.replace(_count(p), expect=_QZ_BY_SITE[p.addr]) for p in _QZ.pokes),
    tables=tuple(dataclasses.replace(_rows(t), symbols=tuple((_QL[u], n) for u, n in _rows(t).symbols)) for t in _QZ.tables))
if set(_QZ_BY_SITE) != {d.site for d in _QZ.detours} | {p.addr for p in _QZ.pokes}:
    raise ValueError('FM Synth restates a quantizer guard its manifest no longer has, or misses one')

_PORT = Linked('fmport', _REL('port.s'), cpu='5475', dram=True)
# port.s's machine record does the author's commit on the base (machine-ports.json: its package
# leaves fm_main_commit to the base's ot_machines commit, which calls admit_track and assign):
# the selection guard for any Part, its popup, the row choice and the machine change's init.
# (The bundled quantizer's panel transaction reads the engine's sy_state, which the author's poly.s
# exports itself since 4d25490.)
_EXPORTS = {'fmmachine': ('fm_choose', 'ml_guard_p', 'ml_toast')}
for _label in _EXPORTS:
    if sum(u.label == _label for u in _SY.linked) != 1:
        raise ValueError('FM Synth: the author\'s manifest no longer has one %s unit' % _label)

MODULE = dataclasses.replace(_SY,
    category=Category.MACHINES, author='timhastie', author_url='https://github.com/timhastie',
    doc='Dedicated FM SYNTH machine: two-operator FM, one to four voices, chords, MIDI, glide, step and scene locks.',
    proof=Proof.UNTESTED, proof_note='Octatrick 2.21 engine, machine list and quantizer; emulator-checked by the author, '
                                     'hardware report for this build pending',
    requires=(), conflicts=(),
    linked=tuple(dataclasses.replace(u, include=_unit_include(u.include), **({'exports': _EXPORTS[u.label]} if u.label in _EXPORTS else {}))
                 for u in _SY.linked) + _QZ.linked + (_PORT,),
    detours=_without(_SY.detours, 'poly', _DROPPED['poly']) + _QZ.detours,
    pokes=_SY.pokes + _QZ.pokes,
    tables=_SY.tables + _QZ.tables,
    pressure_blocker='The DSP-side transport of the CF-generated source is not priced by the FX pricer.')
if not all(isinstance(x.expect, LocalStockSpan) for x in MODULE.detours + MODULE.pokes + MODULE.keeps):
    raise ValueError('FM Synth: every detour, poke and keep expectation is a declared stock guard')
