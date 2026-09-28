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

[DATA, UPLOADS, OUTPUTS].forEach((d) => {
  fs.mkdirSync(d, { recursive: true });
});

const upload = multer({
  dest: UPLOADS,
  limits: { fileSize: 500 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_, res) => {
  res.json({
    ok: true,
    service: "ClipAI"
  });
});

/* Upload video dari HP */
app.post("/api/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "Video belum dipilih."
    });
  }

  const id = crypto.randomUUID();
  const ext = path.extname(req.file.originalname) || ".mp4";
  const input = path.join(UPLOADS, id + ext);

  fs.renameSync(req.file.path, input);

  res.json({
    ok: true,
    id,
    filename: req.file.originalname,
    input
  });
});
app.post("/api/from-url", async (req, res) => {
  const { url } = req.body || {};

  if (!url) {
    return res.status(400).json({
      error: "Link video belum diberikan."
    });
  }

  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("URL tidak valid.");
    }

    const id = crypto.randomUUID();
    const output = path.join(UPLOADS, id + ".mp4");

    const response = await fetch(url);

    if (!response.ok || !response.body) {
      throw new Error("Video tidak dapat diambil dari link tersebut.");
    }

    const fileStream = fs.createWriteStream(output);

    for await (const chunk of response.body) {
      fileStream.write(chunk);
    }

    fileStream.end();

    await new Promise((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    res.json({
      ok: true,
      id,
      input: output
    });

  } catch (err) {
    res.status(400).json({
      error: err.message || "Link video tidak dapat diproses."
    });
  }
});
/* Proses clip 9:16 */
app.post("/api/clip", (req, res) => {
  const { input, start = 0, duration = 30 } = req.body || {};

  if (!input || !fs.existsSync(input)) {
    return res.status(400).json({
      error: "File video tidak ditemukan."
    });
  }

  const s = Math.max(0, Number(start) || 0);
  const d = Math.min(
    120,
    Math.max(1, Number(duration) || 30)
  );

  const id = crypto.randomUUID();
  const output = path.join(OUTPUTS, id + ".mp4");

  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

  const args = [
    "-y",
    "-ss", String(s),
    "-i", input,
    "-t", String(d),
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-c:a", "aac",
    "-movflags", "+faststart",
    output
  ];

  const process = spawn(ffmpeg, args);

  let errorText = "";

  process.stderr.on("data", (data) => {
    errorText += data.toString();
  });

  process.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({
        error: "FFmpeg gagal.",
        detail: errorText.slice(-1000)
      });
    }

    res.json({
      ok: true,
      id,
      url: "/api/download/" + id
    });
  });
});

/* Download hasil */
app.get("/api/download/:id", (req, res) => {
  const file = path.join(
    OUTPUTS,
    req.params.id + ".mp4"
  );

  if (!fs.existsSync(file)) {
    return res.status(404).send("File tidak ditemukan");
  }

  res.download(file, "clipai-clip.mp4");
});

/* Halaman utama */
app.get("*splat", (_, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("ClipAI running on port " + PORT);
});
