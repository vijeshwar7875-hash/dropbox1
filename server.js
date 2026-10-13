require("dotenv").config();

const express = require("express");
const multer = require("multer");
const { Dropbox } = require("dropbox");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const dbx = new Dropbox({
  accessToken: process.env.DROPBOX_ACCESS_TOKEN
});

app.use(express.static("public"));

function validImage(file) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(file);
}


app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file || !req.file.mimetype.startsWith("image/")) {
      return res.status(400).send("Select an image");
    }

    const name = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");

    if (!validImage(name)) {
      return res.status(400).send("Invalid image type");
    }

    await dbx.filesUpload({
      path: "/" + Date.now() + "_" + name,
      contents: req.file.buffer
    });

    res.send("Uploaded successfully");
  } catch (err) {
    res.status(500).send("Upload failed");
  }
});


app.get("/images", async (req, res) => {
  try {
    let result = await dbx.filesListFolder({ path: "" });
    let files = [...result.result.entries];

    while (result.result.has_more) {
      result = await dbx.filesListFolderContinue({
        cursor: result.result.cursor
      });
      files.push(...result.result.entries);
    }

    res.json(
      files
        .filter(f => f[".tag"] === "file" && validImage(f.name))
        .map(f => ({ name: f.name, path: f.path_lower }))
    );
  } catch (err) {
    res.status(500).send("Could not load images");
  }
});

app.get("/image", async (req, res) => {
  try {
    const path = req.query.path;

    if (typeof path !== "string" || !path.startsWith("/")) {
      return res.status(400).send("Invalid path");
    }

    const result = await dbx.filesDownload({ path });
    const file = result.result;

    const data = file.fileBinary || file.fileBlob;
    const buffer = Buffer.isBuffer(data)
      ? data
      : Buffer.from(await data.arrayBuffer());

    const ext = file.name.split(".").pop().toLowerCase();
    const types = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp"
    };

    if (!types[ext]) {
      return res.status(400).send("Not an image");
    }

    res.type(types[ext]);

    if (req.query.download === "1") {
      res.attachment(file.name);
    }

    res.send(buffer);
  } catch (err) {
    res.status(500).send("Download failed");
  }
});

app.listen(3000, () => {
  console.log("Open http://localhost:3000");
});