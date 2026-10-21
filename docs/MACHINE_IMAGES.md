# Machine images

| Machines | Source | Terms |
| --- | --- | --- |
| Octatrack, Digitakt II, Digitone II, Syntakt, Tonverk, Analog Rytm MKII, Analog Four MKII, Analog Heat, Model:Samples, Model:Cycles | [Elektron's press kit](https://www.elektron.se/press) (`Elektron-Press-Kit.zip`, September 2026): each machine's top view from `02. Webshop images`, without shadow | The kit carries no licence. Elektron supports Modwerk, which the owner confirmed on 21 October 2026; record Elektron's written confirmation here when it arrives. Credit "Elektron press kit" wherever the images appear. |
| Digitakt, Digitone (first models) | [elektronmods.com](https://elektronmods.com) device cut-outs | Used with the site owner's permission, confirmed to the Modwerk owner on 4 October 2026. Credit elektronmods.com with a link wherever the images appear. Remove them if permission is withdrawn. |
| Analog Rytm MKI, Analog Keys, Machinedrum, Monomachine | Wikimedia Commons | Each photo's own CC BY or CC BY-SA licence; author, licence and source are listed in `src/devices/photos.ts`. |

Analog Four MKI has no suitable free photo yet (Commons only has teardown shots), so it shows the line drawing.

The press-kit images replaced the smaller elektronmods.com cut-outs (about 240×200 px; the Octatrack, Digitakt II, Digitone II and Model:Cycles ones were scaled-down copies of these press images) and four Commons photos on 21 October 2026. To add or refresh one: take the machine's top view without shadow, trim it to the machine's edges, scale it to fit 960×720 px and save it as WebP at quality 80 (each file is about 25–45 KB).

Files live in `public/machines/`. The app shows a credit line beside each machine's hero image and a full list wherever the machines are shown together: the overview (`#overview`, the landing page) and the forum's front page. Both use `MachinePhotoCredits` in `src/devices/DeviceImage.tsx`. Elektron product names identify the machines only; Modwerk is not affiliated with Elektron.
