/**
 * Convierte el documento actual a código DOT usando el runner Java si es necesario.
 * @param document Documento de VSCode a procesar
 * @param context Contexto de la extensión
 * @returns Código DOT generado
 */
function convertToDot(document: vscode.TextDocument, context: vscode.ExtensionContext): string {
    const fileName = document.fileName;
    const ext = path.extname(fileName).toLowerCase();
    let language: string | null = null;
    if (ext === '.c') {
        language = 'c';
    } else if (ext === '.cbl' || ext === '.cobol') {
        language = 'cobol';
    } else if (ext === '.pse' || ext === '.pseudo') {
        language = 'pseudo';
    }

    // Si no coincide con ninguna extensión soportada, retornar el contenido como DOT
    if (!language) {
        return document.getText();
    }

    // Crear archivo temporal con el contenido del documento
    const tmpDir = path.join(require('os').tmpdir(), 'automaton-automator');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }
    const tempFile = path.join(tmpDir, `automaton-tmp-${Date.now()}${ext}`);
    fs.writeFileSync(tempFile, document.getText(), { encoding: 'utf8' });
    tempFiles.push(tempFile);

    // Construir classpath para el runner Java
    const classpath = context.asAbsolutePath('resources/lib/*');

    // Ejecutar el runner Java
    try {
        const cmd = `java -cp "${classpath}" ProgramChartDesigner.App.Runner ${language} "${tempFile}" --stdout`;
        const result = execSync(cmd, {
            encoding: 'utf-8',
            maxBuffer: renderBufferMB * 1024 * 1024
        });
        if (!result.trim()) {
            throw new Error('El runner Java no devolvió ningún contenido DOT.');
        }
        return result;
    } catch (err: any) {
        throw new Error(`Error al convertir el archivo a DOT: ${err.message || err}`);
    }
}
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

const enableProgramChartDesigner = config.get<Boolean>('enableProgramChartDesigner');

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
            await copyAs(editor.document, 'png');
        }
    });

    const copyAsSvgCommand = vscode.commands.registerCommand('automatonAutomator.copyAsSvg', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && isAutoFile(editor.document)) {
            await copyAs(editor.document, 'svg');
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
                updatePreview(currentPanel, editor.document, context);
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
                updatePreview(currentPanel, event.document, context);
            }
        }
    });

    context.subscriptions.push(
        showPreviewCommand,
        copyAsPngCommand,
        copyAsSvgCommand,
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
    const supportedExtensions = ['.auto', '.dot'].concat(enableProgramChartDesigner ? ['.c', '.cbl', '.cobol', '.pse', '.pseudo'] : []);
    const ext = path.extname(document.fileName).toLowerCase();
    const supportedLanguages = ['dot'].concat(enableProgramChartDesigner ? ['c', 'cobol', 'pseudo'] : []);
    return supportedExtensions.includes(ext) || supportedLanguages.includes(document.languageId);
}

function showPreview(context: vscode.ExtensionContext, document: vscode.TextDocument) {
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Beside);
        updatePreview(currentPanel, document, context);
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

    updatePreview(panel, document, context);
    activeDocument = document;

    panel.onDidDispose(() => {
        currentPanel = undefined;
        activeDocument = undefined;
    });

    panel.webview.onDidReceiveMessage(async message => {
        if (message.command === 'copyAsPng' && activeDocument) {
            await copyAs(activeDocument, 'png');
        }
        else if (message.command === 'copyAsSvg' && activeDocument) {
            await copyAs(activeDocument, 'svg');
        }
    });

    currentPanel = panel;
}

function updatePreview(panel: vscode.WebviewPanel, document: vscode.TextDocument, context: vscode.ExtensionContext) {
    try {
        // Usar convertToDot para obtener el código DOT (o el código original si no requiere conversión)
        const dotCode = convertToDot(document, context);
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

async function copyAs(document: vscode.TextDocument, format: string = 'png') {
    try {
        const dotCode = document.getText();
        const processedDotCode = preprocessDotCode(dotCode);
        
        const tmpDir = path.join(require('os').tmpdir(), 'automaton-automator');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const imageFilePath = path.join(tmpDir, `automaton-${Date.now()}.${format}`);

        tempFiles.push(imageFilePath);
        
        const dpiOption = renderDPI && format !== 'svg' ? ` -Gdpi=${renderDPI}` : '';
        execSync(`dot -T${format + dpiOption} -o "${imageFilePath}"`, {
            input: processedDotCode
        });
        
        const platform = process.platform;
        
        let success = false;
        
        if (platform === 'win32') {
            try {
                const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${imageFilePath.replace(/'/g, "''")}')
[System.Windows.Forms.Clipboard]::SetImage($img)
$img.Dispose()
`;
                execSync(`powershell -NoProfile -STA -Command "${psScript}"`, { windowsHide: true });
                success = true;
            } catch (winError) {
                console.error('Error when copying with PowerShell:', winError);
            }
        } 
        else if (platform === 'darwin') {
            try {
                execSync(`osascript -e 'set the clipboard to (POSIX file "${imageFilePath}")'`);
                success = true;
            } catch (macError) {
                console.error('Error when copying with osascript:', macError);
            }
        } 
        else if (platform === 'linux') {
            try {
                execSync(`xclip -selection clipboard -t image/png -i "${imageFilePath}"`);
                success = true;
            } catch (linuxError) {
                try {
                    execSync(`wl-copy < "${imageFilePath}"`);
                    success = true;
                } catch (waylandError) {
                    console.error('Error when copying with xclip/wl-copy:', linuxError, waylandError);
                }
            }
        }
        
        if (success) {
            vscode.window.showInformationMessage(`Automaton copied as ${format.toUpperCase()} to the clipboard.`);
        } else {
            const openOption = 'Mostrar imagen en carpeta';
            const choice = await vscode.window.showInformationMessage(
                'No se pudo copiar la imagen al portapapeles. Puedes abrir la carpeta que contiene el archivo generado.',
                openOption
            );
            if (choice === openOption) {
                const revealUri = vscode.Uri.file(imageFilePath);
                vscode.commands.executeCommand('revealFileInOS', revealUri);
            }
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
        <button id="copySvgBtn" type="button">Copy as SVG</button>
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

        document.getElementById('copySvgBtn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            vscode.postMessage({
                command: 'copyAsSvg'
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