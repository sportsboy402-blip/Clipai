import express from "express";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static("public"));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "ClipAI" });
});

app.post("/api/analyze-url", async (req, res) => {
  const { url } = req.body || {};

  if (!url) {
    return res.status(400).json({
      error: "URL belum diberikan."
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "GEMINI_API_KEY belum dipasang di Railway."
    });
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    const isYoutube =
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be";

    if (!isYoutube) {
      return res.status(400).json({
        error: "Untuk sementara gunakan URL YouTube publik."
      });
    }

    const prompt = `
Kamu adalah mesin pencari momen video untuk ClipAI.

Analisis video YouTube yang diberikan.

Cari SEBANYAK MUNGKIN momen yang menarik, termasuk momen yang sangat kecil.

Jangan hanya mencari momen utama.

Cari:
- lucu
- reaksi
- cerita
- emosi
- kalimat menarik
- informasi
- fakta
- pertanyaan
- jawaban
- pendapat
- kejadian kecil
- interaksi
- kesalahan
- kejutan
- pernyataan kontroversial
- bagian yang berpotensi membuat orang berhenti scrolling
- bagian singkat tetapi menarik

Target sekitar 10 sampai 20 momen atau lebih jika memang ada.

Setiap momen harus mempunyai:
title
start
end
description
reason

start dan end harus berupa timestamp seperti 00:12 atau 01:25.

PENTING:
- Gunakan timestamp yang benar-benar berasal dari video.
- Jangan mengarang timestamp.
- Jangan membuat momen fiktif.
- Urutkan berdasarkan waktu kemunculannya.
- Jika sebuah momen kecil hanya berlangsung beberapa detik, tetap masukkan.
- Jangan membuat clip atau video.
- Hanya lakukan analisis.

Balas HANYA JSON dengan format:

{
  "moments": [
    {
      "title": "Judul momen",
      "start": "00:00",
      "end": "00:30",
      "description": "Apa yang terjadi",
      "reason": "Kenapa bagian ini menarik"
    }
  ]
}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  file_data: {
                    file_uri: url
                  }
                },
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(data);

      return res.status(500).json({
        error:
          data?.error?.message ||
          "Gemini gagal menganalisis video."
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        error: "Gemini tidak memberikan hasil."
      });
    }

    const result = JSON.parse(text);

    return res.json({
      ok: true,
      moments: result.moments || []
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error:
        error.message ||
        "Video gagal dianalisis."
    });
  }
});

app.get("*splat", (req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("ClipAI running on port " + PORT);
});
