import "dotenv/config";
import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT ?? 3000;

const endpoint = process.env.S3_ENDPOINT ?? "http://194.233.65.126:9000";
const bucket = process.env.S3_BUCKET ?? "test-uploads";
const publicBaseUrl = process.env.S3_PUBLIC_URL ?? endpoint;

const s3 = new S3Client({
  endpoint,
  region: process.env.S3_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
  forcePathStyle: true,
});

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.get("/files", async (req, res) => {
  try {
    const command = new ListObjectsV2Command({ Bucket: bucket });
    const data = await s3.send(command);
    const files = (data.Contents ?? []).map((obj) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
      url: `${publicBaseUrl.replace(/\/$/, "")}/${bucket}/${obj.Key}`,
    }));
    res.json({ ok: true, files });
  } catch (err) {
    console.error(err);
    res.status(502).json({
      error: "Failed to list files",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const rawKey = typeof req.body.key === "string" ? req.body.key.trim() : "";
  if (!rawKey) {
    return res.status(400).json({ error: "Object key is required" });
  }
  const key = rawKey.replace(/\s+/g, "-");

  try {
    const contentLength = req.file.buffer.length;
    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentLength: contentLength,
    });
    const signedUrl = await getSignedUrl(s3, putCommand, { expiresIn: 300 });
    const putRes = await fetch(signedUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(contentLength),
      },
      body: req.file.buffer,
    });
    if (!putRes.ok) {
      const body = await putRes.text();
      console.error("RustFS PUT response:", putRes.status, body);
      return res.status(502).json({
        error: "Upload failed",
        detail: body || putRes.statusText,
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(502).json({
      error: "Upload failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const url = `${publicBaseUrl.replace(/\/$/, "")}/${bucket}/${key}`;
  res.json({ ok: true, key, url });
});

app.delete("/files/*", async (req, res) => {
  const key = req.params[0];
  if (!key) {
    return res.status(400).json({ error: "Key is required" });
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await s3.send(command);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(502).json({
      error: "Delete failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Test upload server at http://localhost:${PORT}`);
});
