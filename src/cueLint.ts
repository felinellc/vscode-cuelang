import { CommandFactory } from "./commands";
import * as utils from "./utils";
import * as vscode from "vscode";
import { isCueNotFoundError } from "./error";

// Handler for command `cue.lint.*`
export function createCommandCueLint(
  channel: vscode.OutputChannel,
  diagnosticCollection: vscode.DiagnosticCollection
): CommandFactory {
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
    const lintFlags: string[] =
      utils.getCueConfig(document.uri).get("lintFlags") || [];
    await cueLint(channel, document, diagnosticCollection, lintFlags);
  };
}

export async function cueLint(
  channel: vscode.OutputChannel,
  document: vscode.TextDocument,
  diagCollection: vscode.DiagnosticCollection,
  lintFlags: string[],
  workspaceFolders?: readonly vscode.WorkspaceFolder[]
) {
  try {
    const { stderr } = await utils.runCue(channel,
      ["vet", document.uri.fsPath, ...lintFlags],
      { cwd: await utils.getConfigModuleRoot(channel, document.uri, workspaceFolders) }
    );
    channel.appendLine(stderr)
    const diagnostics = handleDiagnosticMessages(stderr);
    diagCollection.set(document.uri, diagnostics);
  } catch (e) {
    if (isCueNotFoundError(e)) {
      throw e;
    }
    vscode.window.showErrorMessage(
      `Failed to lint file, error: ${(e as Error).message}`
    );
  }
}

export function handleDiagnosticMessages(content: string): vscode.Diagnostic[] {
  // we also ignore empty lines
  const lines = content.split(/[\r?\n]+/);
  if (lines.length === 0) {
    return [];
  }

  // Valid Error Message is Like
  // expected operand, found 'EOF':
  //     ./examples/simple1.cue:7:3

  // <error-message>:
  //     <file-path>:<line-number>:<column-number>
  //     <file-path>:<line-number>:<column-number>
  //     ...
  const diagnostics: vscode.Diagnostic[] = [];

  let errorMsg = "";
  const re = /^.+:(\d+):(\d+)$/;

  for (const line of lines) {
    // type: error location
    if (line.startsWith("  ") && !errorMsg.includes("incomplete value")) {
      // '    <file-path>:<line-number>:<column-number>'
      const m = re.exec(line);
      if (m) {
        const lineNo = parseInt(m[1]) - 1;
        const columnNo = parseInt(m[2]);
        const range = new vscode.Range(
          new vscode.Position(lineNo, columnNo),
          new vscode.Position(lineNo, columnNo)
        );
        diagnostics.push({
          message: errorMsg,
          range,
          severity: vscode.DiagnosticSeverity.Error,
        });
      }
      continue;
    }

    // type: error message
    const msg = line.trim();
    // not empty line
    if (msg.length !== 0) {
      // remove last colon `xxx:` -> `xxx`
      errorMsg = msg.substring(0, msg.length - 1);
    }
  }

  return diagnostics;
}
