export function validateCoordinates(lat: number, lon: number): { lat: number; lon: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error(`Invalid coordinates: ${lat}, ${lon}`);
  }
  return { lat, lon };
}

function utmBandNorthernHemisphere(band: string): boolean {
  return band >= 'N' && band <= 'X';
}

/** UTM coordinates as shown on some CIVL task pages, e.g. `44T 0320569 4966558`. */
export function parseUtmCoordinates(value: string): { lat: number; lon: number } {
  const normalized = value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(\d{1,2})([C-HJ-NP-X])\s+(\d+)\s+(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid coordinates: ${value}`);
  }

  const zone = Number(match[1]);
  const band = match[2].toUpperCase();
  const easting = Number(match[3]);
  const northing = Number(match[4]);
  const northernHemisphere = utmBandNorthernHemisphere(band);

  const k0 = 0.9996;
  const a = 6378137;
  const e = 0.081819191;
  const e2 = e * e;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  let n = northing;
  if (!northernHemisphere) {
    n -= 10_000_000;
  }

  const x = easting - 500_000;
  const m = n / k0;
  const mu =
    m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));

  const phi1Rad =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);

  const sinPhi1 = Math.sin(phi1Rad);
  const cosPhi1 = Math.cos(phi1Rad);
  const tanPhi1 = Math.tan(phi1Rad);
  const n1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const t1 = tanPhi1 * tanPhi1;
  const c1 = (e2 / (1 - e2)) * cosPhi1 * cosPhi1;
  const r1 = (a * (1 - e2)) / (1 - e2 * sinPhi1 * sinPhi1) ** 1.5;
  const d = x / (n1 * k0);
  const ep2 = e2 / (1 - e2);

  const latRad =
    phi1Rad -
    ((n1 * tanPhi1) / r1) *
      (d * d / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720);

  const lonRad =
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) /
    cosPhi1;

  const lat = (latRad * 180) / Math.PI;
  const lon = ((zone - 1) * 6 - 180 + 3 + (lonRad * 180) / Math.PI + 360) % 360;
  const normalizedLon = lon > 180 ? lon - 360 : lon;

  return validateCoordinates(lat, normalizedLon);
}

export function parseImportCoordinates(value: string): { lat: number; lon: number } {
  const decoded = decodeURIComponent(value.trim());

  const latLonMatch = decoded.match(/Lat:\s*(-?\d+(?:\.\d+)?),\s*Lon:\s*(-?\d+(?:\.\d+)?)/i);
  if (latLonMatch) {
    return validateCoordinates(Number(latLonMatch[1]), Number(latLonMatch[2]));
  }

  const atMatch = decoded.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return validateCoordinates(Number(atMatch[1]), Number(atMatch[2]));
  }

  const textMatch = decoded.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (textMatch) {
    return validateCoordinates(Number(textMatch[1]), Number(textMatch[2]));
  }

  if (/^\d{1,2}[C-HJ-NP-X]\s/i.test(decoded.replace(/\u00a0/g, ' '))) {
    return parseUtmCoordinates(decoded);
  }

  throw new Error(`Invalid coordinates: ${value}`);
}
