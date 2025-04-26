"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const vscode = require("vscode");
const path = require("path");
const child_process_1 = require("child_process");
const fs = require("fs");
let currentPanel;
let activeDocument;
function activate(context) {
    console.log('Automaton Automator is now active!');
    // Registrar el comando para mostrar la vista previa
    const showPreviewCommand = vscode.commands.registerCommand('automatonAutomator.showPreview', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && isAutoFile(editor.document)) {
            showPreview(context, editor.document);
        }
    });
    // Registrar el comando para copiar como PNG
    const copyAsPngCommand = vscode.commands.registerCommand('automatonAutomator.copyAsPng', () => __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (editor && isAutoFile(editor.document)) {
            yield copyAsPng(editor.document);
        }
    }));
    // Auto-mostrar la previsualización cuando se abre un archivo .auto
    vscode.workspace.onDidOpenTextDocument(document => {
        if (isAutoFile(document)) {
            // Pequeño retraso para asegurar que el editor esté listo
            setTimeout(() => {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document === document) {
                    showPreview(context, document);
                }
            }, 300);
        }
    });
    // Cambio del documento activo
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && isAutoFile(editor.document)) {
            // Si cambiamos a un editor con un archivo .auto, actualizamos la previsualización
            if (currentPanel) {
                updatePreview(currentPanel, editor.document);
                activeDocument = editor.document;
            }
            else {
                showPreview(context, editor.document);
            }
        }
        else if (currentPanel && !editor) {
            // Opcional: si queremos ocultar el panel cuando no hay editor activo
            // currentPanel.dispose();
        }
    });
    // Cambio del documento
    vscode.workspace.onDidChangeTextDocument(event => {
        if (isAutoFile(event.document) && currentPanel) {
            // Si el documento activo cambia, actualizamos la previsualización
            if (activeDocument && event.document.uri.toString() === activeDocument.uri.toString()) {
                updatePreview(currentPanel, event.document);
            }
        }
    });
    context.subscriptions.push(showPreviewCommand, copyAsPngCommand);
    // Si hay un editor activo con un archivo .auto al activar la extensión, mostrar la previsualización
    if (vscode.window.activeTextEditor && isAutoFile(vscode.window.activeTextEditor.document)) {
        showPreview(context, vscode.window.activeTextEditor.document);
    }
}
exports.activate = activate;
function isAutoFile(document) {
    return document.languageId === 'dot' || document.fileName.endsWith('.auto');
}
function showPreview(context, document) {
    // Si ya existe un panel, lo enfocamos y actualizamos
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Beside);
        updatePreview(currentPanel, document);
        activeDocument = document;
        return;
    }
    // Crear un nuevo panel de webview al lado del editor
    const panel = vscode.window.createWebviewPanel('automatonAutomatorPreview', 'Automaton Automator Preview', {
        // Colocar explícitamente al lado del editor activo
        viewColumn: vscode.ViewColumn.Beside,
        // Preservar el enfoque en el editor
        preserveFocus: true
    }, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'media'))
        ]
    });
    updatePreview(panel, document);
    activeDocument = document;
    // Registrar el cierre del panel
    panel.onDidDispose(() => {
        currentPanel = undefined;
        activeDocument = undefined;
    });
    // Escuchar mensajes del webview
    panel.webview.onDidReceiveMessage((message) => __awaiter(this, void 0, void 0, function* () {
        if (message.command === 'copyAsPng' && activeDocument) {
            yield copyAsPng(activeDocument);
        }
    }));
    currentPanel = panel;
}
function updatePreview(panel, document) {
    try {
        const dotCode = document.getText();
        // Convertir el código DOT a SVG usando Graphviz
        const svgContent = convertDotToSvg(dotCode);
        panel.webview.html = getWebviewContent(svgContent);
        panel.title = `Vista previa: ${path.basename(document.fileName)}`;
    }
    catch (error) {
        panel.webview.html = getErrorWebviewContent(String(error));
    }
}
function convertDotToSvg(dotCode) {
    try {
        // Intentamos usar el comando dot de Graphviz para la conversión
        const result = (0, child_process_1.execSync)('dot -Tsvg', {
            input: dotCode,
            encoding: 'utf-8'
        });
        return result;
    }
    catch (error) {
        // Si falla, informamos al usuario que necesita instalar Graphviz
        throw new Error(`Error al generar SVG: ${error}.`);
    }
}
function copyAsPng(document) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const dotCode = document.getText();
            // Crear un archivo temporal para el PNG (necesario para algunos métodos de portapapeles)
            const tmpDir = path.join(require('os').tmpdir(), 'automaton-automator');
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
            const pngFilePath = path.join(tmpDir, `automaton-${Date.now()}.png`);
            // Generar el PNG usando Graphviz y guardarlo como archivo
            (0, child_process_1.execSync)(`dot -Tpng -o "${pngFilePath}"`, {
                input: dotCode
            });
            // Detectar sistema operativo
            const platform = process.platform;
            let success = false;
            if (platform === 'win32') {
                // Windows: Usar PowerShell para copiar la imagen al portapapeles
                try {
                    const psScript = `
                    Add-Type -AssemblyName System.Windows.Forms
                    $img = [System.Drawing.Image]::FromFile('${pngFilePath.replace(/\\/g, '\\\\')}')
                    [System.Windows.Forms.Clipboard]::SetImage($img)
                    $img.Dispose()
                `;
                    (0, child_process_1.execSync)(`powershell -command "${psScript}"`, { windowsHide: true });
                    success = true;
                }
                catch (winError) {
                    console.error('Error al copiar con PowerShell:', winError);
                }
            }
            else if (platform === 'darwin') {
                // macOS: Usar osascript (AppleScript)
                try {
                    (0, child_process_1.execSync)(`osascript -e 'set the clipboard to (POSIX file "${pngFilePath}")'`);
                    success = true;
                }
                catch (macError) {
                    console.error('Error al copiar con osascript:', macError);
                }
            }
            else if (platform === 'linux') {
                // Linux: Intentar usar xclip si está disponible
                try {
                    // Intentar con xclip (para X11)
                    (0, child_process_1.execSync)(`xclip -selection clipboard -t image/png -i "${pngFilePath}"`);
                    success = true;
                }
                catch (linuxError) {
                    try {
                        // Intentar con wl-copy (para Wayland)
                        (0, child_process_1.execSync)(`wl-copy < "${pngFilePath}"`);
                        success = true;
                    }
                    catch (waylandError) {
                        console.error('Error al copiar con xclip/wl-copy:', linuxError, waylandError);
                    }
                }
            }
            // Si los métodos específicos del sistema funcionaron
            const DeleteBtn = 'Eliminar archivo temporal';
            if (success) {
                vscode.window.showInformationMessage('Autómata copiado como imagen PNG al portapapeles.', DeleteBtn).then(selection => {
                    if (selection === DeleteBtn) {
                        // Eliminar archivo temporal
                        try {
                            fs.unlinkSync(pngFilePath);
                        }
                        catch (cleanupError) {
                            console.error('Error al eliminar archivo temporal:', cleanupError);
                        }
                    }
                });
            }
            else {
                // Método de respaldo: Copiar como HTML+base64 (el método original)
                const pngBuffer = fs.readFileSync(pngFilePath);
                const pngBase64 = pngBuffer.toString('base64');
                const htmlContent = `<img src="data:image/png;base64,${pngBase64}" alt="Automaton Graph" />`;
                yield vscode.env.clipboard.writeText(htmlContent);
                vscode.window.showInformationMessage('Autómata copiado como HTML+imagen. Para mejor compatibilidad, considera instalar xclip (Linux), o usar las herramientas nativas del sistema.', DeleteBtn).then(selection => {
                    if (selection === DeleteBtn) {
                        // Eliminar archivo temporal
                        try {
                            fs.unlinkSync(pngFilePath);
                        }
                        catch (cleanupError) {
                            console.error('Error al eliminar archivo temporal:', cleanupError);
                        }
                    }
                });
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error al crear PNG: ${error}`);
        }
    });
}
function getWebviewContent(svgContent) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Automaton Automator</title>
    <style>
        body {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .controls {
            margin-bottom: 20px;
        }
        button {
            background-color: #007acc;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background-color: #005999;
        }
        .svg-container {
            border: 1px solid #ccc;
            padding: 10px;
            background-color: white;
            max-width: 100%;
            overflow: auto;
        }
    </style>
</head>
<body>
    <div class="controls">
        <button id="copyBtn">Copiar como PNG</button>
        <button id="zoomInBtn">Zoom +</button>
        <button id="zoomOutBtn">Zoom -</button>
        <button id="resetZoomBtn">Reset Zoom</button>
    </div>
    <div class="svg-container" id="svgContainer">
        ${svgContent}
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        let scale = 1;
        
        document.getElementById('copyBtn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'copyAsPng'
            });
        });
        
        document.getElementById('zoomInBtn').addEventListener('click', () => {
            scale += 0.1;
            updateZoom();
        });
        
        document.getElementById('zoomOutBtn').addEventListener('click', () => {
            scale = Math.max(0.1, scale - 0.1);
            updateZoom();
        });
        
        document.getElementById('resetZoomBtn').addEventListener('click', () => {
            scale = 1;
            updateZoom();
        });
        
        function updateZoom() {
            const svg = document.querySelector('svg');
            if (svg) {
                svg.style.transform = \`scale(\${scale})\`;
                svg.style.transformOrigin = 'top left';
            }
        }
    </script>
</body>
</html>`;
}
function getErrorWebviewContent(errorMessage) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            padding: 20px;
            color: #d32f2f;
        }
        pre {
            background-color: #f5f5f5;
            padding: 10px;
            border-radius: 3px;
            overflow: auto;
        }
    </style>
</head>
<body>
    <h2>Error al generar la visualización</h2>
    <pre>${errorMessage}</pre>
    <p>Asegúrate de que el código DOT sea válido y que Graphviz esté instalado correctamente.</p>
</body>
</html>`;
}
//# sourceMappingURL=extension.js.map