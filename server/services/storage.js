const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

const LOCAL_DIR = path.join(config.ROOT, "uploads");
if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });

function localUrl(filename) {
  return `/uploads/${filename}`;
}

async function saveLocal(buffer, ext = ".jpg") {
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const full = path.join(LOCAL_DIR, filename);
  fs.writeFileSync(full, buffer);
  return { url: localUrl(filename), key: filename, driver: "local" };
}

async function saveS3(buffer, ext = ".jpg", contentType = "image/jpeg") {
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  const key = `dishes/${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const client = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint || undefined,
    forcePathStyle: config.s3.forcePathStyle,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read",
    })
  );
  const url = config.s3.publicBaseUrl
    ? `${config.s3.publicBaseUrl}/${key}`
    : config.s3.endpoint
      ? `${config.s3.endpoint.replace(/\/$/, "")}/${config.s3.bucket}/${key}`
      : `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
  return { url, key, driver: "s3" };
}

function extFromMime(mime) {
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  return map[mime] || ".jpg";
}

async function saveImage(buffer, mime = "image/jpeg") {
  const ext = extFromMime(mime);
  if (config.storageDriver === "s3") {
    if (!config.s3.bucket || !config.s3.accessKeyId) {
      console.warn("[storage] S3 not configured; falling back to local");
      return saveLocal(buffer, ext);
    }
    return saveS3(buffer, ext, mime);
  }
  return saveLocal(buffer, ext);
}

function driverInfo() {
  return {
    driver: config.storageDriver,
    s3Configured: !!(config.s3.bucket && config.s3.accessKeyId),
  };
}

module.exports = {
  saveImage,
  saveLocal,
  driverInfo,
  LOCAL_DIR,
};
