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
    const panel = vscode.window.createWebviewPanel('automatonAutomatorPreview', 'Auto Graphviz Preview', {
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
        throw new Error(`Error al generar SVG: ${error}\nAsegúrate de tener Graphviz instalado en tu sistema y que 'dot' esté en tu PATH.`);
    }
}
function copyAsPng(document) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const dotCode = document.getText();
            // Convertir DOT a PNG usando Graphviz y obtener directamente los datos binarios
            // Nota: Usamos Buffer en lugar de encoding para manejar datos binarios
            const pngBuffer = (0, child_process_1.execSync)(`dot -Tpng`, {
                input: dotCode,
                encoding: null // esto hace que se devuelva un Buffer en lugar de un string
            });
            // Convertir el buffer binario a base64
            const pngBase64 = Buffer.from(pngBuffer).toString('base64');
            // Crear un formato que pueda pegarse en aplicaciones que soporten imágenes
            const htmlContent = `<img src="data:image/png;base64,${pngBase64}" alt="Automaton Graph by HakkinDavid" />`;
            // Copiar al portapapeles
            yield vscode.env.clipboard.writeText(htmlContent);
            vscode.window.showInformationMessage('Autómata copiado como imagen PNG. Pégalo en una aplicación que soporte HTML con imágenes.');
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
    <title>Auto Graphviz Preview</title>
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