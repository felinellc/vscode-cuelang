import { CommandFactory } from "./commands";
import * as vscode from "vscode";
import * as utils from "./utils";
import path = require("path");
import fsp = require("fs/promises");
import { isCueNotFoundError } from "./error";

export const OUT_TYPE_VALUES = ["yaml", "json", "text", "cue"] as const;
export type OutType = typeof OUT_TYPE_VALUES[number];

function outTypeToExt(t: OutType) {
  switch (t) {
    case "text":
      return "txt";
    default:
      return t;
  }
}

export function createCommandCueEval(channel: vscode.OutputChannel, opts: {
  useExpression: boolean;
  outType: OutType | "select";
}): CommandFactory {
  return (ctx) => async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage(
        "No active editor, open a cue file first"
      );
      return;
    }
    if (editor.document.languageId !== "cue") {
      vscode.window.showInformationMessage("Active editor is not a cue file");
      return;
    }

    const document = editor.document;

    const expressions: string[] = [];
    if (opts.useExpression) {
      const input = await vscode.window.showInputBox({
        prompt:
          'Enter expression to evaluate (use space to separate, e.g. "a[0] b[0]")',
      });
      if (!input) {
        vscode.window.showInformationMessage("No expression entered");
        return;
      }

      expressions.push(...input.split(" "));
    }

    let outType = opts.outType;
    if (outType === "select") {
      outType = "cue";
      const input = await vscode.window.showQuickPick(OUT_TYPE_VALUES, {
        canPickMany: false,
        title: "Select output type",
      });

      if (!input) {
        vscode.window.showInformationMessage("No output type selected");
        return;
      }

      outType = input as OutType;
    }

    try {
      const content = await cueEval(channel, {
        filePath: document.uri.fsPath,
        outType,
        expressions,
      });

      // TODO: dispose the temp dir
      // create temp dir
      const { path: tmpDir } = utils.makeTempDir("eval");

      const tmpFile = path.join(tmpDir, `eval.${outTypeToExt(outType)}`);
      await fsp.writeFile(tmpFile, content);
      await vscode.window.showTextDocument(vscode.Uri.file(tmpFile), {
        preview: true,
        viewColumn: vscode.ViewColumn.Beside,
      });
    } catch (e) {
      if (isCueNotFoundError(e)) {
        throw e;
      }
      vscode.window.showErrorMessage(
        `Failed to evaluate file, error: ${(e as Error).message}`
      );
    }
  };
}

export async function cueEval(channel: vscode.OutputChannel, opts: {
  filePath: string;
  expressions: string[];
  outType: OutType;
}): Promise<string> {
  if (!OUT_TYPE_VALUES.includes(opts.outType)) {
    throw new Error(
      `Invalid outType: ${opts.outType}, support (${OUT_TYPE_VALUES.join(
        ", "
      )})`
    );
  }

  let args = [`eval`, opts.filePath];
  for (const expr of opts.expressions) {
    args.push("-e", expr);
  }
  if (opts.outType !== "cue") {
    args.push(`--out`, opts.outType);
  }

  const { stdout, stderr, code } = await utils.runCue(channel, args, {
    cwd: await utils.getConfigModuleRoot(channel),
  });
  if (code !== 0) {
    throw new Error(
      `run command "cue ${args.join(" ")}" failed, stderr: ${stderr}`
    );
  }
  return stdout;
}
