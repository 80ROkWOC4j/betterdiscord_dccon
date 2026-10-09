import createEncoder from "@jsquash/webp/codec/enc/webp_enc.js";
import {defaultOptions} from "@jsquash/webp/meta.js";
import {Image} from "node-webpmux";
import {Buffer} from "buffer";

let initialized;
self.onmessage = async ({data: {bytes, wasm}}) => {
  let decoder;
  try {
    // Use the non-SIMD encoder explicitly so one pinned binary works on all hosts.
    if (!initialized) initialized = createEncoder({
      wasmBinary: wasm,
      locateFile: () => "https://local.invalid/split-encoder.wasm",
    });
    const encoder = await initialized;
    const type = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" ? "image/webp"
      : bytes[0] === 71 ? "image/gif" : bytes[0] === 137 ? "image/png" : "image/jpeg";
    decoder = new ImageDecoder({data: bytes, type});
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const tiles = Array.from({length: 9}, () => []);
    let canvas, context, tileSize;
    for (let frameIndex = 0; frameIndex < track.frameCount; frameIndex++) {
      const {image} = await decoder.decode({frameIndex});
      try {
        if (!canvas) {
          tileSize = Math.ceil(Math.max(image.displayWidth, image.displayHeight) / 3);
          canvas = new OffscreenCanvas(tileSize, tileSize);
          context = canvas.getContext("2d", {willReadFrequently: true});
        }
        const side = tileSize * 3, scale = side / Math.max(image.displayWidth, image.displayHeight);
        const width = image.displayWidth * scale, height = image.displayHeight * scale;
        for (let index = 0; index < 9; index++) {
          context.clearRect(0, 0, tileSize, tileSize);
          context.drawImage(image, (side - width) / 2 - (index % 3) * tileSize,
            (side - height) / 2 - Math.floor(index / 3) * tileSize, width, height);
          const output = encoder.encode(context.getImageData(0, 0, tileSize, tileSize).data, tileSize, tileSize, {
            ...defaultOptions, lossless: 1, quality: 75, method: 0, exact: 1,
          });
          if (!output) throw Error("분할 이미지 인코딩에 실패했습니다.");
          tiles[index].push({buffer: Buffer.from(output),
            delay: Math.max(1, Math.round((image.duration ?? 100000) / 1000)), blend: false, dispose: false});
        }
      } finally {image.close();}
    }
    const loops = Number.isFinite(track.repetitionCount) ? track.repetitionCount + 1 : 0;
    const results = [];
    for (const tile of tiles) {
      const bytes = tile.length === 1 ? tile[0].buffer : await Image.save(null, {
        width: tileSize, height: tileSize, loops,
        frames: await Promise.all(tile.map(frame => Image.generateFrame(frame))),
      });
      results.push(new Uint8Array(bytes).buffer);
    }
    self.postMessage({tiles: results}, results);
  } catch (error) {self.postMessage({error: error.message || String(error)});}
  finally {decoder?.close();}
};
