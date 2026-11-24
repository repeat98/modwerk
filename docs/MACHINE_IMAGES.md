# Machine images

| Machines | Source | Terms |
| --- | --- | --- |
| Octatrack, Digitakt II, Digitone II, Syntakt, Tonverk, Analog Rytm MKII, Analog Four MKII, Analog Heat, Model:Samples, Model:Cycles | [Elektron's press kit](https://www.elektron.se/press) (`Elektron-Press-Kit.zip`, September 2026): each machine's top view from `02. Webshop images`, without shadow | The kit carries no licence. Elektron supports Modwerk, which the owner confirmed on 21 October 2026; record Elektron's written confirmation here when it arrives. Credit "Elektron press kit" wherever the images appear. |
| Digitakt, Digitone (first models) | [elektronmods.com](https://elektronmods.com) device cut-outs | Used with the site owner's permission, confirmed to the Modwerk owner on 4 October 2026. Credit elektronmods.com with a link wherever the images appear. Remove them if permission is withdrawn. |
| Analog Rytm MKI, Analog Keys, Machinedrum, Monomachine | Wikimedia Commons | Each photo's own CC BY or CC BY-SA licence; author, licence and source are listed in `src/devices/photos.ts`. |
| Analog Four MKI | [Elektron's legacy catalog](https://www.elektron.se/legacy), cropped from the Analog Four MKI banner | Elektron product image. |
| Zoom MS-70CDR, MS-50G, MS-60B, G1on series and G1 FOUR | Zoom's product galleries, linked in `src/devices/photos.ts`. The G1on represents its series. | Zoom product images used for model identification. The galleries do not state a reuse licence. |
| Erica Synths LXR-02 | Erica Synths' [product page](https://www.ericasynths.lv/drum-synthesizer-lxr-02-1132/): the top view `Drum_Synthesizer_LXR-02-2_3.png` (1500×1500 PNG cut-out) | The image carries no licence, and Erica Synths' firmware NOTICE.md reserves the product's appearance. Added on 23 October 2026 at the owner's request, only to identify the machine. Record Erica Synths' written permission here when it arrives, and remove the image if they object. Credit "Erica Synths" wherever it appears. Their other LXR image, `LXR_Module_1_wbg`, shows the Eurorack LXR Drum Module, a different machine. |

The Zoom setup dialog uses an original SVG illustration from `src/devices/ZoomPedalArt.tsx`.

The press-kit images replaced the smaller elektronmods.com cut-outs (about 240×200 px; the Octatrack, Digitakt II, Digitone II and Model:Cycles ones were scaled-down copies of these press images) and four Commons photos on 21 October 2026. To add or refresh one: take the machine's top view without shadow, trim it to the machine's edges, scale it to fit 960×720 px and save it as WebP at quality 80 (each file is about 25–45 KB).

Files live in `public/machines/`. The app shows a credit line beside each machine's hero image and a full list wherever the machines are shown together: the overview (`#overview`, the landing page) and the forum's front page. Both use `MachinePhotoCredits` in `src/devices/DeviceImage.tsx`. Elektron product names identify the machines only; Modwerk is not affiliated with Elektron.
