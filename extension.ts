import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';
import * as fs from 'fs';
let dotExecutablePath: string;
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
const symbolMap = { ...defaultSymbolMap, ...userSymbolMap };
const symbolDecorationsEnabled = config.get<Boolean>('symbolDecorations');
const enableProgramChartDesigner = config.get<Boolean>('enableProgramChartDesigner');
const renderDPI = config.get<Number>('renderDPI') ?? 0;
const renderBufferMB = config.get<Number>('renderBufferMB')?.valueOf() ?? 10;
const language = config.get<string>('language'); 
const localization = {
    en: {
        previewTitle: 'Preview:',
        errorNoContent: 'The Java runner returned no DOT content.',
        errorConvert: 'Error converting file to DOT:',
        errorCopying: (agent: string) => `Error when copying with ${agent}.`,
        copiedMessage: (format: string) => `Automaton copied as ${format.toUpperCase()} to the clipboard.`,
        failedCopyMessage: 'Could not copy the image to the clipboard. You can open the folder containing the generated file.',
        openFolderOption: 'Show image in folder',
        previewPanelTitle: 'Automaton Automator Preview',
        copyAsPng: 'Copy as PNG',
        copyAsSvg: 'Copy as SVG',
        zoomIn: 'Zoom +',
        zoomOut: 'Zoom -',
        resetZoom: 'Reset Zoom',
        errorDiagramTitle: "Couldn't update the diagram",
        errorDiagramSubtitle: 'Showing last correctly generated diagram...',
        symbols: {
            epsilon: "epsilon",
            arrow: "arrow",
            union: "union",
            intersection: "intersection",
            sigma: "sigma",
            emptySet: "empty set",
            blankSpace: "blank space",
        }
    },
    es: {
        previewTitle: 'Vista previa:',
        errorNoContent: 'El runner Java no devolvió ningún contenido DOT.',
        errorConvert: 'Error al convertir el archivo a DOT:',
        errorCopying: (agent: string) => `Error al copiar con ${agent}.`,
        copiedMessage: (format: string) => `Autómata copiado como ${format.toUpperCase()} al portapapeles.`,
        failedCopyMessage: 'No se pudo copiar la imagen al portapapeles. Puedes abrir la carpeta que contiene el archivo generado.',
        openFolderOption: 'Mostrar imagen en carpeta',
        previewPanelTitle: 'Vista previa de Automaton Automator',
        copyAsPng: 'Copiar como PNG',
        copyAsSvg: 'Copiar como SVG',
        zoomIn: 'Acercar +',
        zoomOut: 'Alejar -',
        resetZoom: 'Restablecer zoom',
        errorDiagramTitle: 'No se pudo actualizar el diagrama',
        errorDiagramSubtitle: 'Mostrando el último diagrama generado correctamente...',
        symbols: {
            epsilon: "épsilon",
            arrow: "flecha",
            union: "unión",
            intersection: "intersección",
            sigma: "sigma",
            emptySet: "conjunto vacío",
            blankSpace: "espacio",
        }
    }
};
const t = localization[language === 'es' ? 'es' : 'en'];
let tempFiles: string[] = [];
let lastCorrectDiagram = "";
function convertToDot(document: vscode.TextDocument, context: vscode.ExtensionContext): string {
    const fileName = document.fileName;
    const ext = path.extname(fileName).toLowerCase();
    let language: string | null = null;
    if (ext === '.c' || document.languageId.toLowerCase() == "c") {
        language = 'c';
    } else if (ext === '.cbl' || ext === '.cobol' || document.languageId.toLowerCase() == "cobol") {
        language = 'cobol';
    } else if (ext === '.pse' || ext === '.pseudo') {
        language = 'pseudo';
    }
    if (!language) {
        return document.getText();
    }
    const tmpDir = path.join(require('os').tmpdir(), 'automaton-automator');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }
    const tempFile = path.join(tmpDir, `automaton-tmp-${Date.now()}${ext}`);
    fs.writeFileSync(tempFile, document.getText(), { encoding: 'utf8' });
    tempFiles.push(tempFile);
    const classpath = context.asAbsolutePath('resources/lib/*');
    try {
        const cmd = `java -cp "${classpath}" ProgramChartDesigner.App.Runner ${language} "${tempFile}" --stdout`;
        const result = execSync(cmd, {
            encoding: 'utf-8',
            maxBuffer: renderBufferMB * 1024 * 1024
        });
        if (!result.trim()) {
            throw new Error(t.errorNoContent);
        }
        return result;
    } catch (err: any) {
        throw new Error(`${t.errorConvert} ${err.message || err}`);
    }
}
export function activate(context: vscode.ExtensionContext) {
    dotExecutablePath = resolveDotExecutable(context);
    const showPreviewCommand = vscode.commands.registerCommand('automatonAutomator.showPreview', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && isAutoFile(editor.document)) {
            showPreview(context, editor.document);
        }
    });
    const copyAsPngCommand = vscode.commands.registerCommand('automatonAutomator.copyAsPng', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && isAutoFile(editor.document)) {
            await copyAs(editor.document, context, 'png');
        }
    });
    const copyAsSvgCommand = vscode.commands.registerCommand('automatonAutomator.copyAsSvg', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && isAutoFile(editor.document)) {
            await copyAs(editor.document, context, 'svg');
        }
    });
    const insertSymbolCommand = vscode.commands.registerCommand(
        'automatonAutomator.insertSymbol', 
        async () => {
            const symbols = [
                { label: `ε (${t.symbols.epsilon})`, value: 'ε' },
                { label: `→ (${t.symbols.arrow})`, value: '→' },
                { label: `∪ (${t.symbols.union})`, value: '∪' },
                { label: `∩ (${t.symbols.intersection})`, value: '∩' },
                { label: `Σ (${t.symbols.sigma})`, value: 'Σ' },
                { label: `∅ (${t.symbols.emptySet})`, value: '∅' },
                { label: `⊔ (${t.symbols.blankSpace})`, value: '⊔'}
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
    const escapeToVisible = Object.entries(symbolMap).map(([logicalKey, symbol]) => {
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
    processedCode = processedCode.replace(/^[\t ]+/gm, ''); 
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
        t.previewPanelTitle,
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
            await copyAs(activeDocument, context, 'png');
        }
        else if (message.command === 'copyAsSvg' && activeDocument) {
            await copyAs(activeDocument, context, 'svg');
        }
    });
    currentPanel = panel;
}
function updatePreview(panel: vscode.WebviewPanel, document: vscode.TextDocument, context: vscode.ExtensionContext) {
    try {
        const dotCode = convertToDot(document, context);
        const processedDotCode = preprocessDotCode(dotCode);
        const svgContent = convertDotToSvg(processedDotCode, context);
        const isPanelInitialized = panel.webview.html.includes('automaton-automator-initialized');
        if (isPanelInitialized) {
            lastCorrectDiagram = svgContent;
            panel.webview.postMessage({
                command: 'updateSvg',
                svgContent: svgContent
            });
        } else {
            lastCorrectDiagram = svgContent;
            panel.webview.html = getWebviewContent(svgContent);
        }
        panel.title = `${t.previewTitle} ${path.basename(document.fileName)}`;
    } catch (error) {
        panel.webview.html = getWebviewContent(lastCorrectDiagram).replace("<div id=\"notes\"></div>", "<div id=\"notes\">" + getErrorWebviewContent(String(error)) + "</div>");
    }
}
function resolveDotExecutable(context: vscode.ExtensionContext): string {
    const binPath = path.join(context.extensionPath, 'resources', 'bin');
    const dotWindows = path.join(binPath, 'dot.exe');
    const dotUnix = path.join(binPath, 'dot');
    if (process.platform === 'win32' && fs.existsSync(dotWindows)) {
        return `"${dotWindows}"`;
    } else if (fs.existsSync(dotUnix)) {
        return `"${dotUnix}"`;
    } else {
        return 'dot'; 
    }
}
function convertDotToSvg(dotCode: string, context: vscode.ExtensionContext): string {
    try {
        const result = execSync(`${dotExecutablePath} -Tsvg`, {
            input: dotCode,
            encoding: 'utf-8',
            maxBuffer: renderBufferMB * 1024 * 1024
        });
        return result;
    } catch (error) {
        throw new Error(`${t.errorConvert} ${error}.`);
    }
}
async function copyAs(document: vscode.TextDocument, context: vscode.ExtensionContext, format: string = 'png') {
    try {
        const dotCode = convertToDot(document, context);
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
                console.error(` ${t.errorCopying("PowerShell")}`, winError);
            }
        } 
        else if (platform === 'darwin') {
            try {
                execSync(`osascript -e 'set the clipboard to (POSIX file "${imageFilePath}")'`);
                success = true;
            } catch (macError) {
                console.error(` ${t.errorCopying("osascript")}`, macError);
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
                    console.error(` ${t.errorCopying("xclip/wl-copy")}`, linuxError, waylandError);
                }
            }
        }
        if (success) {
            vscode.window.showInformationMessage(t.copiedMessage(format));
        } else {
            const openOption = t.openFolderOption;
            const choice = await vscode.window.showInformationMessage(
                t.failedCopyMessage,
                openOption
            );
            if (choice === openOption) {
                const revealUri = vscode.Uri.file(imageFilePath);
                vscode.commands.executeCommand('revealFileInOS', revealUri);
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`${t.errorConvert} ${error}`);
    }
}
function getWebviewContent(svgContent: string): string {
    return `<!DOCTYPE html>
<html lang="en" class="automaton-automator-initialized">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t.previewPanelTitle}</title>
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
        <button id="copyBtn" type="button">${t.copyAsPng}</button>
        <button id="copySvgBtn" type="button">${t.copyAsSvg}</button>
        <button id="zoomInBtn" type="button">${t.zoomIn}</button>
        <button id="zoomOutBtn" type="button">${t.zoomOut}</button>
        <button id="resetZoomBtn" type="button">${t.resetZoom}</button>
    </div>
    <div class="svg-container" id="svgContainer">
        ${svgContent}
    </div>
    <div id=\"notes\"></div>
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
                    document.getElementById('notes').innerHTML = '';
                    document.getElementById('svgContainer').innerHTML = message.svgContent;
                    updateZoom();
                    break;
            }
        });
        document.addEventListener('click', function(e) {
            if (e.target && (
                e.target.tagName === 'BUTTON' || 
                e.target.closest('button')
            )) {
                return true;
            }
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
        document.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }, true);
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
    return `<h2 class="errTitle">${t.errorDiagramTitle}</h2>
    <p class="errMsg">${errorMessage}</p>
    <style>
        .errTitle {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            padding: 20px;
            color: #d32f2f;
            /* Prevenir selección para evitar que VSCode interprete los clics como selección */
            user-select: none;
            -webkit-user-select: none;
        }
        .errMsg {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #d32f2f;
            /* Prevenir selección para evitar que VSCode interprete los clics como selección */
            user-select: none;
            -webkit-user-select: none;
            padding: 10px;
            border-radius: 3px;
            overflow: auto;
        }
    </style>
    <h2 class="errTitle">${t.errorDiagramSubtitle}</h2>`;
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