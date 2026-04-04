import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, parse } from "node:path";

function ensureWindowsHost(): void {
  if (process.platform !== "win32") {
    throw new Error("This action is only available on Windows hosts.");
  }
}

async function getDownloadsDirectory(): Promise<string> {
  ensureWindowsHost();
  const downloadsDirectory = join(homedir(), "Downloads");
  await mkdir(downloadsDirectory, { recursive: true });
  return downloadsDirectory;
}

async function createUniqueFilePath(directory: string, fileName: string): Promise<string> {
  const parsed = parse(fileName);
  const extension = parsed.ext || extname(fileName) || ".pdf";
  const baseName = parsed.name || "ojt-export";
  let candidate = join(directory, `${baseName}${extension}`);
  let counter = 1;

  while (true) {
    try {
      await access(candidate, constants.F_OK);
      candidate = join(directory, `${baseName}-${counter}${extension}`);
      counter += 1;
    } catch {
      return candidate;
    }
  }
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function encodeUtf8Value(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeExpression(value: string): string {
  return `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodeUtf8Value(value)}'))`;
}

async function runPowerShellScript(script: string): Promise<void> {
  ensureWindowsHost();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodePowerShellCommand(script)
      ],
      {
        windowsHide: true
      }
    );

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `PowerShell exited with code ${code}.`));
    });
  });
}

export async function exportExistingPdfToDownloads(sourcePath: string, fileName: string): Promise<string> {
  const downloadsDirectory = await getDownloadsDirectory();
  const targetPath = await createUniqueFilePath(downloadsDirectory, fileName);
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  return targetPath;
}

export async function exportPdfBufferToDownloads(fileName: string, pdfBytes: Buffer | Uint8Array): Promise<string> {
  const downloadsDirectory = await getDownloadsDirectory();
  const targetPath = await createUniqueFilePath(downloadsDirectory, fileName);
  await writeFile(targetPath, Buffer.from(pdfBytes));
  return targetPath;
}

export async function openOutlookDraftWithAttachment(input: {
  to: string;
  cc: string[];
  subject: string;
  body: string;
  attachmentPath: string;
}): Promise<void> {
  const script = [
    `$to = ${decodeExpression(input.to)}`,
    `$cc = ${decodeExpression(input.cc.join("; "))}`,
    `$subject = ${decodeExpression(input.subject)}`,
    `$body = ${decodeExpression(input.body)}`,
    `$attachment = ${decodeExpression(input.attachmentPath)}`,
    "$outlook = New-Object -ComObject Outlook.Application",
    "$mail = $outlook.CreateItem(0)",
    "$mail.To = $to",
    'if ($cc) { $mail.CC = $cc }',
    "$mail.Subject = $subject",
    "$mail.Body = $body",
    '$null = $mail.Attachments.Add($attachment)',
    "$mail.Display()"
  ].join("\n");

  await runPowerShellScript(script);
}
