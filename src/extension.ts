// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import path = require("path");
import * as vscode from "vscode";
import { createRegisterCommand } from "./commands";
import { createCommandCueEval } from "./cueEval";
import { CueDocumentFormattingEditProvider } from "./cueFmt";
import { createCommandCueLint, cueLint } from "./cueLint";
import * as utils from "./utils";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

  let output = vscode.window.createOutputChannel("Cue Debug")

  let diagnosticCollection = vscode.languages.createDiagnosticCollection("cue");
  context.subscriptions.push(diagnosticCollection);

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      "cue",
      new CueDocumentFormattingEditProvider(output)
    )
  );

  // Lint
  const registerCommand = createRegisterCommand(context);
  registerCommand("cue.lint.file", createCommandCueLint(output, diagnosticCollection));

  // == related lint on save ==
  const lintOnSave = async (channel: vscode.OutputChannel, document: vscode.TextDocument, workspaceFolders?: readonly vscode.WorkspaceFolder[]) => {
    if (document.languageId === "cue") {
      const cueConfig = utils.getCueConfig(document.uri);

      const lintOnSave = cueConfig.get("lintOnSave");
      const lintFlags: string[] = cueConfig.get("lintFlags") || [];

      //output.appendLine("Checking if can lint (save)")

      if (lintOnSave && lintOnSave !== "off") {
        //output.appendLine("Linting due to save action")
        cueLint(channel, document, diagnosticCollection, lintFlags, workspaceFolders);
      }
    }
  };

  const lintOnChange = async (channel: vscode.OutputChannel, { document, contentChanges }: vscode.TextDocumentChangeEvent, workspaceFolders?: readonly vscode.WorkspaceFolder[]) => {
    if (document.languageId === "cue") {
      const cueConfig = utils.getCueConfig(document.uri);

      const lintOnChange = cueConfig.get("lintOnChange");
      const lintFlags: string[] = cueConfig.get("lintFlags") || [];

      // output.appendLine("Checking if can lint (change)") 

      // var contents = document.getText()
      // const tmpPath = path.join("/", "tmp", "vscode-cuelang", document.uri.fsPath)
      // for (var i = 0; i < contentChanges.length; i++) {
      //   const change = contentChanges[i];
      //   const replace = change.text

      //   await vscode.commands.executeCommand("vscode.open", tmpPath)

      //   vscode.window.activeTextEditor?.edit(editBuilder => {
      //     editBuilder.replace(new vscode.Range(0, 0, 1, 0), 'This is a long text meant to replace something that was shorter.');
      //   })
      // }

      if (lintOnChange && lintOnChange !== "off") {
        // output.appendLine("Linting due to change action")
        await document.save();

        // cueLint(channel, document, diagnosticCollection, lintFlags, workspaceFolders);
      }
    }
  };
  // when first open and save file
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => lintOnSave(output, doc, vscode.workspace.workspaceFolders)),
    vscode.workspace.onDidSaveTextDocument((doc) => lintOnSave(output, doc, vscode.workspace.workspaceFolders)),
    vscode.workspace.onDidChangeTextDocument((doc) => lintOnChange(output, doc, vscode.workspace.workspaceFolders))
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(async (document) => {
      if (document.languageId === "cue") {
        diagnosticCollection.delete(document.uri);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      // if change lintOnSave, remove all diagnostic
      if (
        ["cue.lintOnSave", "cue.lintFlags"].some((s) =>
          e.affectsConfiguration(s)
        )
      ) {
        diagnosticCollection.clear();
      }
    })
  );
  // == end lint on save ==

  // == Start Evaluation ==
  registerCommand(
    "cue.eval.file.cue",
    createCommandCueEval(output, {
      useExpression: false,
      outType: "cue",
    })
  );

  registerCommand(
    "cue.eval.file.expression.cue",
    createCommandCueEval(output, {
      useExpression: true,
      outType: "cue",
    })
  );

  registerCommand(
    "cue.eval.file",
    createCommandCueEval(output, {
      useExpression: false,
      outType: "select",
    })
  );

  registerCommand(
    "cue.eval.file.expression",
    createCommandCueEval(output, {
      useExpression: true,
      outType: "select",
    })
  );
  // == End Evaluation ==
}

// this method is called when your extension is deactivated
export function deactivate() {
  utils.cleanupTempDir();
}
