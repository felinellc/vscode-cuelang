// Some codes are derived from https://github.com/golang/vscode-go/blob/master/src/config.ts

import * as vscode from "vscode";
import hasbin = require("hasbin");
import cp = require("child_process");
import fs = require("fs");
import path = require("path");
import os = require("os");
import process = require("process");
import { CueNotFoundError } from "../error";
import { vscodeVariables } from "./vscode_variables";

export { vscodeVariables } from "./vscode_variables";

export function getCueConfig(uri?: vscode.Uri): vscode.WorkspaceConfiguration {
  return getConfig("cue", uri);
}

export function getConfig(
  section: string,
  uri?: vscode.Uri | null
): vscode.WorkspaceConfiguration {
  if (!uri) {
    if (vscode.window.activeTextEditor) {
      uri = vscode.window.activeTextEditor.document.uri;
    } else {
      uri = null;
    }
  }
  return vscode.workspace.getConfiguration(section, uri);
}

const readdirAsync = (dir: string): Promise<string[]> => {
  return new Promise((res, rej) => fs.readdir(dir, (err, files) => {
    if (err) rej(err);
    return res(files);
  }))
}

export const resolveModuleRoot = async (workspaceRoot: string, root: string): Promise<string> => {
  const files = await readdirAsync(root);
  const validFiles = files.filter(file => file.endsWith("cue.mod"))
  if (validFiles.length == 0) {
    if (root == workspaceRoot) {
      throw new Error("No cue.mod in entire root");
    }
    return resolveModuleRoot(workspaceRoot, path.dirname(root));
  }
  return root;
}
export const getConfigModuleRoot = async (channel: vscode.OutputChannel, uri?: vscode.Uri, workspaceFolders?: readonly vscode.WorkspaceFolder[]): Promise<string> => {

  const config = getCueConfig(uri).get("moduleRoot") as string;

  let moduleRoot: string =
    config || "${workspaceFolder}";

  moduleRoot = vscodeVariables(moduleRoot, false);

  if (!moduleRoot) {
    moduleRoot = process.cwd();
  }

  if (uri?.path) {
    moduleRoot = await resolveModuleRoot(moduleRoot, path.dirname(uri.path));
  }

  // channel.appendLine(`ModRoot: ${moduleRoot}`)

  return moduleRoot as string;
}

export function hasBinCue(): Promise<boolean> {
  return new Promise((resolve) => {
    hasbin("cue", (res) => resolve(res));
  });
}

export function isVisibleDocument(document: vscode.TextDocument) {
  return vscode.window.visibleTextEditors.some(
    (e) => e.document.fileName === document.fileName
  );
}

export function promptNoCue() {
  vscode.window.showInformationMessage(
    `CUE is not installed. Please make sure 'cue' is in your PATH. Check [https://cuelang.org/docs/install/](https://cuelang.org/docs/install/) to install CUE.`
  );
}

export function runCue(
  channel: vscode.OutputChannel,
  args: string[],
  options?: cp.SpawnOptionsWithoutStdio
): Promise<{
  stdout: string;
  stderr: string;
  code: number;
}> {
  return new Promise((resolve, reject) => {
    let child = cp.spawn("cue", args.concat(["-c"]), options);
    channel.appendLine(`cue ${args} --- ${options}`)
    const output = {
      stdout: "",
      stderr: "",
      code: 0,
    };

    child.stdout.on("data", (data) => {
      output.stdout += data;
    });
    child.stderr.on("data", (data) => {
      output.stderr += data;
    });
    child.on("error", (err) => {
      if (err && (err as any).code === "ENOENT") {
        promptNoCue();
        reject(new CueNotFoundError(err.message));
      }
      reject(err);
    });
    child.on("close", (code) => {
      output.code = code || 0;
      resolve(output);
    });
  });
}

let tmpDir: string | undefined;

// makeTempDir make temp dir under vscode-cue temp dir
export function makeTempDir(prefix?: string): {
  path: string;
  // dispose clean temp file
  dispose: () => void;
} {
  if (!tmpDir) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-cue-"));
  }

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }

  // create temp file in /tmp/vscode-cue-<random>/<random>/<name>
  const dirPath = fs.mkdtempSync(tmpDir + path.sep + (prefix || ""));

  return {
    path: dirPath,
    dispose: () => {
      fs.rmSync(dirPath, { recursive: true, force: true });
    },
  };
}

export function cleanupTempDir() {
  if (tmpDir) {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
  tmpDir = undefined;
}

export function dirBaseName(p: string): {
  dir: string;
  basename: string;
} {
  return {
    dir: path.dirname(p),
    basename: path.basename(p),
  };
}

export function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  );
}

export function extractErrorMessage(e: unknown): string {
  if (isErrorWithMessage(e)) {
    return e.message;
  }
  return String(e);
}
