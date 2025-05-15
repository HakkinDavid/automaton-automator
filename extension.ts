import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';
import * as fs from 'fs';

let currentPanel: vscode.WebviewPanel | undefined;
let activeDocument: vscode.TextDocument | undefined;

let symbolDecorationType: vscode.TextEditorDecorationType | undefined;

const config = vscode.workspace.getConfiguration('automatonAutomator');

const userSymbolMap = config.get<Record<string, string>>('symbolMappings') || {};

const defaultSymbolMap: Record<string, string> = {
    '\\epsilon': 'ε',
    '\\to': '→',
    '\\rightarrow': '→',
    '\\union': '∪',
    '\\cup': '∪',
    '\\intersect': '∩',
    '\\cap': '∩',
    '\\sigma': 'Σ',
    '\\emptyset': '∅',
    '\\empty': '∅',
    '\\space': '⊔',
    '\\tab': '\t',
    "_1": "₁",
    "_2": "₂",
    "_3": "₃",
    "_4": "₄",
    "_5": "₅",
    "_6": "₆",
    "_7": "₇",
    "_8": "₈",
    "_9": "₉",
    "_0": "₀"
};

// Definir mapeo de secuencias de escape a símbolos matemáticos
const symbolMap = { ...defaultSymbolMap, ...userSymbolMap };

const symbolDecorationsEnabled = config.get<Boolean>('symbolDecorations');

const renderDPI = config.get<Number>('renderDPI') ?? 0;

const renderBufferMB = config.get<Number>('renderBufferMB')?.valueOf() ?? 10;

let tempFiles: string[] = [];

export function activate(context: vscode.ExtensionContext) {
    console.log('Automaton Automator is now active!');

    const showPreviewCommand = vscode.commands.registerCommand('automatonAutomator.showPreview', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && isAutoFile(editor.document)) {
            showPreview(context, editor.document);
        }
    });

    const copyAsPngCommand = vscode.commands.registerCommand('automatonAutomator.copyAsPng', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && isAutoFile(editor.document)) {
            await copyAsPng(editor.document);
        }
    });

    const insertSymbolCommand = vscode.commands.registerCommand(
        'automatonAutomator.insertSymbol', 
        async () => {
            const symbols = [
                { label: 'ε (epsilon)', value: 'ε' },
                { label: '→ (flecha)', value: '→' },
                { label: '∪ (unión)', value: '∪' },
                { label: '∩ (intersección)', value: '∩' },
                { label: 'Σ (sigma)', value: 'Σ' },
                { label: '∅ (conjunto vacío)', value: '∅' },
                { label: '⊔ (espacio)', value: '⊔'}
            ];
            
            const selected = await vscode.window.showQuickPick(
                symbols.map(s => s.label),
                { placeHolder: 'Selecciona un símbolo para insertar' }
            );
            
            if (selected) {
                const symbol = symbols.find(s => s.label === selected)?.value;
                const editor = vscode.window.activeTextEditor;
                if (editor && symbol) {
                    editor.edit(editBuilder => {
                        editBuilder.insert(editor.selection.active, symbol);
                    });
                }
            }
        }
    );

    vscode.workspace.onDidOpenTextDocument(document => {
        if (isAutoFile(document)) {
            setTimeout(() => {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document === document) {
                    showPreview(context, document);
                }
            }, 300);
        }
    });

    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && isAutoFile(editor.document)) {
            applySymbolDecorations(editor);
            if (currentPanel) {
                updatePreview(currentPanel, editor.document);
                activeDocument = editor.document;
            } else {
                showPreview(context, editor.document);
            }
        } else if (currentPanel && !editor) {
            currentPanel.dispose();
        }
    });

    vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document && isAutoFile(editor.document)) {
            applySymbolDecorations(editor);
        }
        if (isAutoFile(event.document) && currentPanel) {
            if (activeDocument && event.document.uri.toString() === activeDocument.uri.toString()) {
                updatePreview(currentPanel, event.document);
            }
        }
    });

    context.subscriptions.push(
        showPreviewCommand,
        copyAsPngCommand,
        insertSymbolCommand
    );

    if (vscode.window.activeTextEditor && isAutoFile(vscode.window.activeTextEditor.document)) {
        applySymbolDecorations(vscode.window.activeTextEditor);
        showPreview(context, vscode.window.activeTextEditor.document);
    }
}

// Utiliza decoradores de texto en VS Code para mostrar los símbolos
function applySymbolDecorations(editor: vscode.TextEditor) {
    if (!symbolDecorationsEnabled) {
        return;
    }
    if (symbolDecorationType) {
        symbolDecorationType.dispose();
    }

    symbolDecorationType = vscode.window.createTextEditorDecorationType({
        textDecoration: 'none; display: none;'
    });

    const decorations: vscode.DecorationOptions[] = [];
    const text = editor.document.getText();

    // Convertir claves del symbolMap a su forma textual escapada literal
    const escapeToVisible = Object.entries(symbolMap).map(([logicalKey, symbol]) => {
        // El documento contiene \\epsilon, por lo que hay que convertir \epsilon -> \\epsilon
        const rawTextKey = logicalKey.replace(/\\/g, '\\\\');
        return { rawTextKey, symbol };
    });

    for (const { rawTextKey, symbol } of escapeToVisible) {
        const regex = new RegExp(rawTextKey.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');

        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[0].length);

            decorations.push({
                range: new vscode.Range(startPos, endPos),
                renderOptions: {
                    before: {
                        contentText: symbol,
                        color: '#f0a800',
                        margin: '0 0 0 0',
                    }
                }
            });
        }
    }

    editor.setDecorations(symbolDecorationType, decorations);
}

function preprocessDotCode(dotCode: string): string {
    let processedCode = dotCode;
    for (const [sequence, symbol] of Object.entries(symbolMap)) {
        const regex = new RegExp(sequence.replace(/\\/g, '\\\\'), 'g');
        processedCode = processedCode.replace(regex, symbol);
    }

    processedCode = processedCode.replace(/^[\t ]+/gm, ''); // Permite que el usuario utilice indentación pero la elimina del código DOT final, ya que Graphviz lo graficaría
    
    return processedCode;
}

function isAutoFile(document: vscode.TextDocument): boolean {
    return document.languageId === 'dot' || document.fileName.endsWith('.auto');
}

function showPreview(context: vscode.ExtensionContext, document: vscode.TextDocument) {
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Beside);
        updatePreview(currentPanel, document);
        activeDocument = document;
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'automatonAutomatorPreview',
        'Automaton Automator Preview',
        {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: true
        },
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, 'media'))
            ]
        }
    );

    updatePreview(panel, document);
    activeDocument = document;

    panel.onDidDispose(() => {
        currentPanel = undefined;
        activeDocument = undefined;
    });

    panel.webview.onDidReceiveMessage(async message => {
        if (message.command === 'copyAsPng' && activeDocument) {
            await copyAsPng(activeDocument);
        }
    });

    currentPanel = panel;
}

function updatePreview(panel: vscode.WebviewPanel, document: vscode.TextDocument) {
    try {
        const dotCode = document.getText();
        const processedDotCode = preprocessDotCode(dotCode);
        
        const svgContent = convertDotToSvg(processedDotCode);
        
        const isPanelInitialized = panel.webview.html.includes('automaton-automator-initialized');
        
        if (isPanelInitialized) {
            panel.webview.postMessage({
                command: 'updateSvg',
                svgContent: svgContent
            });
        } else {
            panel.webview.html = getWebviewContent(svgContent);
        }
        
        panel.title = `Vista previa: ${path.basename(document.fileName)}`;
    } catch (error) {
        panel.webview.html = panel.webview.html || getErrorWebviewContent(String(error));
    }
}

function convertDotToSvg(dotCode: string): string {
    try {
        const result = execSync('dot -Tsvg', { 
            input: dotCode, 
            encoding: 'utf-8',
            maxBuffer: renderBufferMB * 1024 * 1024
        });
        return result;
    } catch (error) {
        throw new Error(`Error al generar SVG: ${error}.`);
    }
}

async function copyAsPng(document: vscode.TextDocument) {
    try {
        const dotCode = document.getText();
        const processedDotCode = preprocessDotCode(dotCode);
        
        const tmpDir = path.join(require('os').tmpdir(), 'automaton-automator');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const pngFilePath = path.join(tmpDir, `automaton-${Date.now()}.png`);

        tempFiles.push(pngFilePath);
        
        const dpiOption = renderDPI ? ` -Gdpi=${renderDPI}` : '';
        execSync(`dot -Tpng${dpiOption} -o "${pngFilePath}"`, {
            input: processedDotCode
        });
        
        const platform = process.platform;
        
        let success = false;
        
        if (platform === 'win32') {
            try {
                const psScript = `
                    Add-Type -AssemblyName System.Windows.Forms
                    $img = [System.Drawing.Image]::FromFile('${pngFilePath.replace(/\\/g, '\\\\')}')
                    [System.Windows.Forms.Clipboard]::SetImage($img)
                    $img.Dispose()
                `;
                execSync(`powershell -command "${psScript}"`, { windowsHide: true });
                success = true;
            } catch (winError) {
                console.error('Error when copying with PowerShell:', winError);
            }
        } 
        else if (platform === 'darwin') {
            try {
                execSync(`osascript -e 'set the clipboard to (POSIX file "${pngFilePath}")'`);
                success = true;
            } catch (macError) {
                console.error('Error when copying with osascript:', macError);
            }
        } 
        else if (platform === 'linux') {
            try {
                execSync(`xclip -selection clipboard -t image/png -i "${pngFilePath}"`);
                success = true;
            } catch (linuxError) {
                try {
                    execSync(`wl-copy < "${pngFilePath}"`);
                    success = true;
                } catch (waylandError) {
                    console.error('Error when copying with xclip/wl-copy:', linuxError, waylandError);
                }
            }
        }
        
        const DeleteBtn = 'Delete temporary file';
        if (success) {
            vscode.window.showInformationMessage('Automaton copied as PNG to the clipboard.');
        } else {
            const pngBuffer = fs.readFileSync(pngFilePath);
            const pngBase64 = pngBuffer.toString('base64');
            const htmlContent = `<img src="data:image/png;base64,${pngBase64}" alt="Automaton Graph" />`;
            await vscode.env.clipboard.writeText(htmlContent);
            vscode.window.showInformationMessage('Automaton copied as HTML image to the clipboard.');
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(`Error when creating PNG: ${error}`);
    }
}

function getWebviewContent(svgContent: string): string {
    return `<!DOCTYPE html>
<html lang="en" class="automaton-automator-initialized">
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
            /* Prevenir selección para evitar que VSCode interprete los clics como selección */
            user-select: none;
            -webkit-user-select: none;
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
        <button id="copyBtn" type="button">Copy as PNG</button>
        <button id="zoomInBtn" type="button">Zoom +</button>
        <button id="zoomOutBtn" type="button">Zoom -</button>
        <button id="resetZoomBtn" type="button">Reset Zoom</button>
    </div>
    <div class="svg-container" id="svgContainer">
        ${svgContent}
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        let scale = 1;
        
        const currentState = vscode.getState() || { scale: 1 };
        scale = currentState.scale;
        
        updateZoom();
        
        document.getElementById('copyBtn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            vscode.postMessage({
                command: 'copyAsPng'
            });
            return false;
        });
        
        document.getElementById('zoomInBtn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            scale += 0.1;
            updateZoom();
            saveState();
            return false;
        });
        
        document.getElementById('zoomOutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            scale = Math.max(0.1, scale - 0.1);
            updateZoom();
            saveState();
            return false;
        });
        
        document.getElementById('resetZoomBtn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            scale = 1;
            updateZoom();
            saveState();
            return false;
        });
        
        function updateZoom() {
            const svg = document.querySelector('svg');
            if (svg) {
                svg.style.transform = \`scale(\${scale})\`;
                svg.style.transformOrigin = 'top left';
            }
        }
        
        function saveState() {
            vscode.setState({ scale: scale });
        }
        
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'updateSvg':
                    document.getElementById('svgContainer').innerHTML = message.svgContent;
                    updateZoom();
                    break;
            }
        });
        
        // Manejar eventos de clic selectivamente
        document.addEventListener('click', function(e) {
            // Permitir que los botones funcionen normalmente
            if (e.target && (
                e.target.tagName === 'BUTTON' || 
                e.target.closest('button')
            )) {
                return true;
            }
            
            // Para cualquier otro elemento, prevenir comportamiento predeterminado
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
        
        // Manejar eventos de mousedown selectivamente
        document.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
        
        // Prevenir doble clic que podría causar selección de texto
        document.addEventListener('dblclick', function(e) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
    </script>
</body>
</html>`;
}

function getErrorWebviewContent(errorMessage: string): string {
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
            /* Prevenir selección para evitar que VSCode interprete los clics como selección */
            user-select: none;
            -webkit-user-select: none;
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
    <h2>Couldn't generate your automaton</h2>
    <pre>${errorMessage}</pre>
    <p>Make sure to have Graphviz and DOT installed and in your PATH.</p>
    <script>
        // Manejar eventos de clic selectivamente
        document.addEventListener('click', function(e) {
            // Permitir que los botones funcionen normalmente
            if (e.target && (
                e.target.tagName === 'BUTTON' || 
                e.target.closest('button')
            )) {
                return true;
            }
            
            // Para cualquier otro elemento, prevenir comportamiento predeterminado
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
        
        // Manejar eventos de mousedown selectivamente
        document.addEventListener('mousedown', function(e) {
            // Permitir que los botones funcionen normalmente
            if (e.target && (
                e.target.tagName === 'BUTTON' || 
                e.target.closest('button')
            )) {
                return true;
            }
            
            // Para cualquier otro elemento, prevenir comportamiento predeterminado
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
    </script>
</body>
</html>`;
}

export function deactivate() {
    if (symbolDecorationType) {
        symbolDecorationType.dispose();
        symbolDecorationType = undefined;
    }
    tempFiles.forEach((v) => {
        fs.unlinkSync(v);
    });
}