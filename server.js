import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;

const DATA = path.join(__dirname, "data");
const UPLOADS = path.join(DATA, "uploads");
const OUTPUTS = path.join(DATA, "outputs");

for (const dir of [DATA, UPLOADS, OUTPUTS]) {
  fs.mkdirSync(dir, { recursive: true });
}

const upload = multer({
  dest: UPLOADS,
  limits: {
    fileSize: 500 * 1024 * 1024
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "ClipAI"
  });
});


/* =========================
   ANALYZE URL
========================= */

app.post("/api/analyze-url", async (req, res) => {

  const { url } = req.body || {};

  if (!url) {
    return res.status(400).json({
      error: "URL belum diberikan."
    });
  }

  try {

    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("URL tidak valid.");
    }

    const host = parsed.hostname.toLowerCase();

    /* YouTube */

    if (
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be"
    ) {

      const response = await fetch(
        "https://www.youtube.com/oembed?url=" +
        encodeURIComponent(url) +
        "&format=json"
      );

      if (!response.ok) {
        throw new Error(
          "Video YouTube tidak dapat dikenali."
        );
      }

      const data = await response.json();

      return res.json({
        ok: true,
        source: "youtube",
        title: data.title,
        author: data.author_name,
        thumbnail: data.thumbnail_url,
        message:
          "URL YouTube berhasil dikenali."
      });
    }


    /* Direct video */

    const response = await fetch(url, {
      method: "HEAD"
    });

    const contentType =
      response.headers.get("content-type") || "";

    if (contentType.startsWith("video/")) {

      return res.json({
        ok: true,
        source: "direct-video",
        title: "Video",
        message:
          "URL video langsung berhasil dikenali."
      });
    }


    throw new Error(
      "URL belum didukung. Gunakan URL YouTube atau URL video langsung."
    );

  } catch (error) {

    return res.status(400).json({
      error:
        error.message ||
        "URL tidak dapat dianalisis."
    });
  }
});


/* =========================
   DIRECT VIDEO URL
========================= */

app.post("/api/from-url", async (req, res) => {

  const { url } = req.body || {};

  if (!url) {
    return res.status(400).json({
      error: "URL video belum diberikan."
    });
  }

  try {

    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("URL tidak valid.");
    }

    const id = crypto.randomUUID();
    const output = path.join(
      UPLOADS,
      id + ".mp4"
    );

    const response = await fetch(url);

    if (!response.ok || !response.body) {
      throw new Error(
        "Video tidak dapat diambil dari URL."
      );
    }

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.startsWith("video/")) {
      throw new Error(
        "URL tersebut bukan file video langsung."
      );
    }

    const stream =
      fs.createWriteStream(output);

    for await (const chunk of response.body) {
      stream.write(chunk);
    }

    stream.end();

    await new Promise((resolve, reject) => {

      stream.on("finish", resolve);
      stream.on("error", reject);

    });

    res.json({
      ok: true,
      source: "direct-video",
      id,
      input: output
    });

  } catch (error) {

    res.status(400).json({
      error:
        error.message ||
        "Video tidak dapat diambil."
    });
  }
});


/* =========================
   UPLOAD VIDEO
========================= */

app.post(
  "/api/upload",
  upload.single("video"),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: "Video belum dipilih."
      });
    }

    const id = crypto.randomUUID();

    const ext =
      path.extname(
        req.file.originalname
      ) || ".mp4";

    const input = path.join(
      UPLOADS,
      id + ext
    );

    fs.renameSync(
      req.file.path,
      input
    );

    res.json({
      ok: true,
      id,
      input,
      filename: req.file.originalname
    });
  }
);


/* =========================
   CREATE CLIP
========================= */

app.post("/api/clip", (req, res) => {

  const {
    input,
    start = 0,
    duration = 30
  } = req.body || {};

  if (!input || !fs.existsSync(input)) {
    return res.status(400).json({
      error: "File video tidak ditemukan."
    });
  }

  const startTime = Math.max(
    0,
    Number(start) || 0
  );

  const clipDuration = Math.min(
    120,
    Math.max(
      1,
      Number(duration) || 30
    )
  );

  const id = crypto.randomUUID();

  const output = path.join(
    OUTPUTS,
    id + ".mp4"
  );

  const ffmpeg =
    process.env.FFMPEG_PATH ||
    "ffmpeg";

  const args = [
    "-y",

    "-ss",
    String(startTime),

    "-i",
    input,

    "-t",
    String(clipDuration),

    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",

    "-c:v",
    "libx264",

    "-preset",
    "veryfast",

    "-crf",
    "23",

    "-c:a",
    "aac",

    "-movflags",
    "+faststart",

    output
  ];

  const process = spawn(
    ffmpeg,
    args
  );

  let errorText = "";

  process.stderr.on(
    "data",
    data => {
      errorText +=
        data.toString();
    }
  );

  process.on(
    "close",
    code => {

      if (code !== 0) {

        return res.status(500).json({
          error: "FFmpeg gagal.",
          detail:
            errorText.slice(-1000)
        });
      }

      res.json({
        ok: true,
        id,
        url:
          "/api/download/" +
          id
      });

    }
  );
});


/* =========================
   DOWNLOAD CLIP
========================= */

app.get(
  "/api/download/:id",
  (req, res) => {

    const file = path.join(
      OUTPUTS,
      req.params.id + ".mp4"
    );

    if (!fs.existsSync(file)) {
      return res.status(404).send(
        "File tidak ditemukan."
      );
    }

    res.download(
      file,
      "clipai-clip.mp4"
    );
  }
);


/* =========================
   FRONTEND
========================= */

app.get("*splat", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});


/* =========================
   START SERVER
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "ClipAI running on port " +
      PORT
    );

  }
);
