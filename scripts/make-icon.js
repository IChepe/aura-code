// Genera media/icon.png (128x128) sin dependencias: un orbe con degradado aurora.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 128;
const stops = [[15, 155, 142], [106, 48, 147], [255, 56, 100]];

function mix(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function gradient(t) {
    return t < 0.5 ? mix(stops[0], stops[1], t * 2) : mix(stops[1], stops[2], (t - 0.5) * 2);
}

const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    for (let x = 0; x < S; x++) {
        const dx = x - S / 2 + 0.5, dy = y - S / 2 + 0.5;
        const d = Math.sqrt(dx * dx + dy * dy) / (S / 2);
        const [r, g, b] = gradient((x + y) / (2 * S));
        // borde suave + brillo interior tipo cristal
        const alpha = Math.max(0, Math.min(1, (0.96 - d) * 40));
        const shine = Math.max(0, 1 - Math.hypot(dx + 22, dy + 26) / 40) * 0.55;
        const o = y * (S * 4 + 1) + 1 + x * 4;
        raw[o] = Math.min(255, r + 255 * shine);
        raw[o + 1] = Math.min(255, g + 255 * shine);
        raw[o + 2] = Math.min(255, b + 255 * shine);
        raw[o + 3] = Math.round(alpha * 255);
    }
}

function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xff;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;  // bits
ihdr[9] = 6;  // RGBA
const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(path.join(__dirname, '..', 'media', 'icon.png'), png);
console.log('media/icon.png generado');
