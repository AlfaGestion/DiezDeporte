import "server-only";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { Client } from "basic-ftp";

const PRODUCT_UPLOAD_PUBLIC_PREFIX = "/api/product-images";
const MAX_IMAGE_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const MIME_EXTENSION_MAP = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

const EXTENSION_CONTENT_TYPE_MAP = new Map<string, string>([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
  ["avif", "image/avif"],
]);

type ProductImageStorageConfig =
  | {
      type: "local";
      root: string;
    }
  | {
      type: "ftp";
      host: string;
      port: number;
      user: string;
      password: string;
      secure: boolean;
      remoteDirectory: string;
    };

declare global {
  var __diezDeportesProductImageStorageReady:
    | { key: string; promise: Promise<void> }
    | undefined;
}

function sanitizeProductFolderName(productId: string) {
  const normalized = productId
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "articulo";
}

function getFileExtension(file: File) {
  const mimeExtension = MIME_EXTENSION_MAP.get(file.type);
  if (mimeExtension) {
    return mimeExtension;
  }

  const match = file.name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = match?.[1] || "";

  if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }

  return null;
}

function parseBooleanEnv(value: string | undefined, fallback = false) {
  if (typeof value !== "string") {
    return fallback;
  }

  return ["1", "true", "yes", "si", "on"].includes(value.trim().toLowerCase());
}

function normalizeFtpDirectory(value: string) {
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/+$/g, "");

  return normalized || ".";
}

function deriveFtpRemoteDirectory() {
  const explicitDirectory = process.env.APP_PRODUCT_IMAGE_FTP_REMOTE_DIRECTORY?.trim();
  if (explicitDirectory) {
    return normalizeFtpDirectory(explicitDirectory);
  }

  const configuredDirectory =
    process.env.APP_PRODUCT_IMAGE_UPLOAD_DIRECTORY?.trim()
    || process.env.APP_PRODUCT_IMAGE_DIRECTORY?.trim()
    || "";

  if (configuredDirectory.startsWith("\\\\")) {
    const segments = configuredDirectory
      .replace(/^\\\\/, "")
      .split("\\")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length > 1) {
      return normalizeFtpDirectory(segments.slice(1).join("/"));
    }
  }

  return ".";
}

function getProductImageStorageConfig(): ProductImageStorageConfig {
  const ftpHost = process.env.APP_PRODUCT_IMAGE_FTP_HOST?.trim() || "";

  if (ftpHost) {
    const ftpUser = process.env.APP_PRODUCT_IMAGE_FTP_USER?.trim() || "";
    const ftpPassword = process.env.APP_PRODUCT_IMAGE_FTP_PASSWORD?.trim() || "";
    const ftpPort = Number(process.env.APP_PRODUCT_IMAGE_FTP_PORT?.trim() || "21");

    if (!ftpUser || !ftpPassword) {
      throw new Error(
        "Configura APP_PRODUCT_IMAGE_FTP_USER y APP_PRODUCT_IMAGE_FTP_PASSWORD en .env.",
      );
    }

    return {
      type: "ftp",
      host: ftpHost,
      port: Number.isFinite(ftpPort) && ftpPort > 0 ? ftpPort : 21,
      user: ftpUser,
      password: ftpPassword,
      secure: parseBooleanEnv(process.env.APP_PRODUCT_IMAGE_FTP_SECURE, false),
      remoteDirectory: deriveFtpRemoteDirectory(),
    };
  }

  const configuredRoot =
    process.env.APP_PRODUCT_IMAGE_UPLOAD_DIRECTORY?.trim()
    || process.env.APP_PRODUCT_IMAGE_DIRECTORY?.trim()
    || "";

  if (!configuredRoot) {
    throw new Error(
      "Configura APP_PRODUCT_IMAGE_UPLOAD_DIRECTORY o APP_PRODUCT_IMAGE_FTP_HOST en .env.",
    );
  }

  return {
    type: "local",
    root: path.resolve(configuredRoot),
  };
}

function getStorageCacheKey(config: ProductImageStorageConfig) {
  if (config.type === "local") {
    return `local:${config.root}`;
  }

  return [
    "ftp",
    config.host,
    config.port,
    config.user,
    config.remoteDirectory,
    config.secure ? "secure" : "plain",
  ].join(":");
}

function buildManagedProductImageUrl(fileName: string) {
  return `${PRODUCT_UPLOAD_PUBLIC_PREFIX}/${encodeURIComponent(fileName)}`;
}

function normalizeManagedFileName(value: string) {
  const decoded = decodeURIComponent(value || "").trim();

  if (!decoded || decoded === "." || decoded === "..") {
    return null;
  }

  if (decoded.includes("/") || decoded.includes("\\")) {
    return null;
  }

  return decoded;
}

function getManagedFileNameFromUrl(url: string) {
  let pathname = "";

  try {
    pathname = new URL(url, "http://admin.local").pathname;
  } catch {
    return null;
  }

  if (!pathname.startsWith(`${PRODUCT_UPLOAD_PUBLIC_PREFIX}/`)) {
    return null;
  }

  return normalizeManagedFileName(pathname.slice(PRODUCT_UPLOAD_PUBLIC_PREFIX.length + 1));
}

function toManagedLocalFilePathFromFileName(fileName: string) {
  const normalizedFileName = normalizeManagedFileName(fileName);
  if (!normalizedFileName) {
    return null;
  }

  const config = getProductImageStorageConfig();
  if (config.type !== "local") {
    return null;
  }

  const filePath = path.resolve(config.root, normalizedFileName);
  const relativePath = path.relative(config.root, filePath);

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return filePath;
}

function buildStoredFileName(productId: string, index: number, extension: string) {
  const safeProductId = sanitizeProductFolderName(productId);
  return `${safeProductId}-${Date.now()}-${index}-${randomUUID().slice(0, 8)}.${extension}`;
}

function buildFtpRemoteFilePath(fileName: string) {
  return fileName;
}

function getFtpMissingFileError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /(?:^|\s)550(?:\s|$)|file not found|no such file|not exist/i.test(message);
}

async function withFtpClient<T>(
  callback: (
    client: Client,
    config: Extract<ProductImageStorageConfig, { type: "ftp" }>,
  ) => Promise<T>,
) {
  const config = getProductImageStorageConfig();

  if (config.type !== "ftp") {
    throw new Error("El almacenamiento de imagenes no esta configurado en modo FTP.");
  }

  const client = new Client(15000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: config.secure,
    });

    await client.ensureDir(config.remoteDirectory);

    return await callback(client, config);
  } finally {
    client.close();
  }
}

async function readManagedProductImageFromFtp(fileName: string) {
  return withFtpClient(async (client) => {
    const remotePath = buildFtpRemoteFilePath(fileName);
    const chunks: Buffer[] = [];

    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    });

    await client.downloadTo(writable, remotePath);
    return Buffer.concat(chunks);
  });
}

export async function ensureProductImageStorageReady() {
  const config = getProductImageStorageConfig();
  const cacheKey = getStorageCacheKey(config);

  if (
    global.__diezDeportesProductImageStorageReady &&
    global.__diezDeportesProductImageStorageReady.key === cacheKey
  ) {
    return global.__diezDeportesProductImageStorageReady.promise;
  }

  const promise = (async () => {
    if (config.type === "local") {
      await fs.mkdir(config.root, { recursive: true });
      return;
    }

    await withFtpClient(async () => undefined);
  })();

  global.__diezDeportesProductImageStorageReady = {
    key: cacheKey,
    promise,
  };

  try {
    return await promise;
  } catch (error) {
    global.__diezDeportesProductImageStorageReady = undefined;
    throw error;
  }
}

export function isManagedProductImageUrl(url: string) {
  return Boolean(getManagedFileNameFromUrl(url));
}

export function getManagedProductImageFilePath(fileName: string) {
  return toManagedLocalFilePathFromFileName(fileName);
}

export function getManagedProductImageContentType(fileName: string) {
  const extension = path.extname(fileName).replace(/^\./, "").trim().toLowerCase();
  return EXTENSION_CONTENT_TYPE_MAP.get(extension) || "application/octet-stream";
}

export async function readManagedProductImage(fileName: string) {
  const normalizedFileName = normalizeManagedFileName(fileName);
  if (!normalizedFileName) {
    throw new Error("Imagen no encontrada.");
  }

  const config = getProductImageStorageConfig();

  if (config.type === "local") {
    const filePath = toManagedLocalFilePathFromFileName(normalizedFileName);
    if (!filePath) {
      throw new Error("Imagen no encontrada.");
    }

    return fs.readFile(filePath);
  }

  return readManagedProductImageFromFtp(normalizedFileName);
}

export async function saveUploadedProductImages(input: {
  productId: string;
  files: File[];
}) {
  await ensureProductImageStorageReady();

  const config = getProductImageStorageConfig();
  const uploadedUrls: string[] = [];
  let fileIndex = 0;

  const preparedFiles: Array<{
    buffer: Buffer;
    fileName: string;
    publicUrl: string;
  }> = [];

  for (const file of input.files) {
    if (!file || typeof file.size !== "number" || file.size <= 0) {
      continue;
    }

    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      throw new Error("Cada imagen debe pesar como maximo 8 MB.");
    }

    const extension = getFileExtension(file);
    if (!extension) {
      throw new Error("Solo se aceptan imagenes JPG, PNG, WEBP, GIF o AVIF.");
    }

    const fileName = buildStoredFileName(input.productId, fileIndex, extension);
    preparedFiles.push({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName,
      publicUrl: buildManagedProductImageUrl(fileName),
    });
    fileIndex += 1;
  }

  try {
    if (config.type === "local") {
      for (const file of preparedFiles) {
        const absolutePath = path.join(config.root, file.fileName);
        await fs.writeFile(absolutePath, file.buffer);
        uploadedUrls.push(file.publicUrl);
      }

      return uploadedUrls;
    }

    await withFtpClient(async (client) => {
      for (const file of preparedFiles) {
        const remotePath = buildFtpRemoteFilePath(file.fileName);
        await client.uploadFrom(Readable.from([file.buffer]), remotePath);
        uploadedUrls.push(file.publicUrl);
      }
    });

    return uploadedUrls;
  } catch (error) {
    if (uploadedUrls.length > 0) {
      await deleteManagedProductImages(uploadedUrls);
    }

    throw error;
  }
}

export async function deleteManagedProductImages(urls: string[]) {
  const fileNames = Array.from(
    new Set(
      urls
        .map((url) => getManagedFileNameFromUrl(url))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (fileNames.length === 0) {
    return;
  }

  const config = getProductImageStorageConfig();

  if (config.type === "local") {
    await Promise.all(
      fileNames.map(async (fileName) => {
        const filePath = toManagedLocalFilePathFromFileName(fileName);
        if (!filePath) {
          return;
        }

        try {
          await fs.unlink(filePath);
        } catch (error) {
          const code =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
              ? error.code
              : "";

          if (code !== "ENOENT") {
            throw error;
          }
        }
      }),
    );

    return;
  }

  await withFtpClient(async (client) => {
    for (const fileName of fileNames) {
      try {
        await client.remove(buildFtpRemoteFilePath(fileName));
      } catch (error) {
        if (!getFtpMissingFileError(error)) {
          throw error;
        }
      }
    }
  });
}

export function isMissingManagedProductImageError(error: unknown) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";

  if (code === "ENOENT") {
    return true;
  }

  return getFtpMissingFileError(error);
}
