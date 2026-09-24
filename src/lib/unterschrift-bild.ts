import "server-only";

import sharp from "sharp";

/**
 * Macht aus einem eingescannten oder fotografierten Unterschriftsbild ein
 * freigestelltes PNG: weisser Hintergrund wird durchsichtig, leere Raender
 * fallen weg. So legt sich die Unterschrift sauber ueber den Vordruck,
 * ohne ein weisses Rechteck ueber die Formularlinien zu kleben.
 *
 * Liefert eine PNG-Data-URL, wie sie auch die am Bildschirm gezeichnete
 * Mieterunterschrift hat - damit kann fillTemplate beide gleich behandeln.
 */
export async function unterschriftFreistellen(eingabe: Buffer): Promise<string> {
  // Auf handliche Groesse bringen, Raender abschneiden, Alphakanal sicherstellen.
  const { data, info } = await sharp(eingabe)
    .rotate() // EXIF-Drehung von Handyfotos beachten
    .flatten({ background: "#ffffff" })
    .trim({ threshold: 40 })
    .resize({ width: 1200, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixel = Buffer.from(data);
  for (let i = 0; i < pixel.length; i += 4) {
    const r = pixel[i];
    const g = pixel[i + 1];
    const b = pixel[i + 2];
    const helligkeit = (r + g + b) / 3;
    // Fast weiss -> durchsichtig; dazwischen weich ausblenden, damit die
    // Kanten der Tinte nicht ausgefranst wirken.
    if (helligkeit > 235) pixel[i + 3] = 0;
    else if (helligkeit > 180) pixel[i + 3] = Math.round(((235 - helligkeit) / 55) * 255);
  }

  const png = await sharp(pixel, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
