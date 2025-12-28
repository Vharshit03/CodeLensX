const vscode = require('vscode');
const SidebarProvider = require('./sidebarProvider');
const AIService = require('./Services/AIservice');
const { initialize: initializeTools } = require('./Services/tools');
const {getResultHtml} = require('./UI/resultView');
const path = require('path'); // Moved require('path') to the top


let aiService;
let outputChannel;

function activate(context) {
    // console.log('AI Code Reviewer extension activated'); // Removed console.log

    // Create output channel for logs
    outputChannel = vscode.window.createOutputChannel('AI Code Reviewer');
    
    // Initialize tools with output channel
    initializeTools(outputChannel);
    
    // Initialize AI Service
    aiService = new AIService(context, outputChannel);

    // Register sidebar
    //@ts-ignore- 
    const sidebarProvider = new SidebarProvider(context, aiService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'codelensx.settingsView',
            sidebarProvider
        )
    );

    // Register commands
    registerCommands(context);

    context.subscriptions.push(outputChannel);
}

function registerCommands(context) {
    // Review Workspace Command
    const reviewWorkspace = vscode.commands.registerCommand(
        'codelensx.reviewWorkspace',
        async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            await runReviewWithProgress(workspaceFolder.uri.fsPath);
        }
    );

    // Review Current File Command
    const reviewFile = vscode.commands.registerCommand(
        'codelensx.reviewFile',
        async () => {
            const editor = vscode.window.activeTextEditor;
            
            if (!editor) {
                vscode.window.showErrorMessage('No file open');
                return;
            }

            const fileDir = path.dirname(editor.document.uri.fsPath);
            await runReviewWithProgress(fileDir);
        }
    );

    // Open Settings Command
    const openSettings = vscode.commands.registerCommand(
        'codelensx.openSettings',
        () => {
            vscode.commands.executeCommand('codelensx.settingsView.focus');
        }
    );

    const showReport = vscode.commands.registerCommand(
        'codelensx.showReport', 
        (results) => {
            // Create and show your report panel here
            showResultsPanel(results);
        }
    );

    context.subscriptions.push(
        reviewWorkspace,
        reviewFile,
        showReport,
        openSettings
    );
}

/**
 * Run review with VS Code progress notification
 */
async function runReviewWithProgress(directory) {
    // Show output channel
    outputChannel.show(true);
    outputChannel.clear();
    
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "CodeLens Review",
            cancellable: true
        },
        async (progress, token) => {
            try {
                // Progress callback
                const progressCallback = ({ message, increment }) => {
                    progress.report({ message, increment });
                };

                // Run review
                const results = await aiService.runReview(
                    directory,
                    progressCallback
                );

                // Save results to history
                await saveReviewHistory(results);

                // Show success message
                vscode.window.showInformationMessage(
                    `Review complete! Fixed ${results.filesFixed} files`,
                    'View Report'
                ).then(selection => {
                    if (selection === 'View Report') {
                        showResultsPanel(results);
                    }
                });

                return results;

            } catch (error) {
                vscode.window.showErrorMessage(
                    `Review failed: ${error.message}`
                );
                outputChannel.appendLine(`\n❌ Error: ${error.message}`);
                throw error;
            }
        }
    );
}

/**
 * Save review results to history
 */
async function saveReviewHistory(results) {
    const context = aiService.context;
    const history = context.globalState.get('reviewHistory', []);
    
    const review = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        totalFiles: results.totalFiles,
        filesFixed: results.filesFixed,
        security: results.security.length,
        bugs: results.bugs.length,
        quality: results.quality.length,
        summary: results.summary
    };
    
    history.unshift(review);
    
    // Keep only last 10 reviews
    if (history.length > 10) {
        history.length = 10;
    }
    
    await context.globalState.update('reviewHistory', history);
}

/**
 * Show results in webview panel
 */
function showResultsPanel(results) {
    const panel = vscode.window.createWebviewPanel(
        'aiReviewResults',
        'AI Review Results',
        vscode.ViewColumn.Three,
        {
            enableScripts: true
        }
    );

    panel.webview.html = getResultsHtml(results);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'openFile':
                await openFileAtLine(message.file, message.line);
                break;
            case 'exportReport':
                await exportReport(results);
                break;
            case 'reviewAgain':
                panel.dispose();
                vscode.commands.executeCommand('codelensx.reviewWorkspace');
                break;
        }
    });
}

/**
 * Generate results HTML
 */
function getResultsHtml(results) {
    const totalIssues = results.security.length + results.bugs.length + results.quality.length;
    
    return getResultHtml(results);
}

/**
 * Open file at specific line
 */
async function openFileAtLine(filePath, lineNumber) {
    try {
        // Convert relative path to absolute path
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        // Handle both absolute and relative paths
        let absolutePath = filePath;
        if (!path.isAbsolute(filePath)) {
            absolutePath = path.join(workspaceFolders[0].uri.fsPath, filePath);
        }

        const uri = vscode.Uri.file(absolutePath);
        
        // Check if file exists
        try {
            await vscode.workspace.fs.stat(uri);
        } catch {
            vscode.window.showErrorMessage(`File not found: ${filePath}`);
            return;
        }

        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
        
        if (lineNumber > 0) {
            const position = new vscode.Position(lineNumber - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Could not open file: ${error.message}`);
        console.error('Error opening file:', error);
    }
}

/**
 * Export report to HTML file
 */
async function exportReport(results) {
    try {
        const html = getResultsHtml(results);
        
        const uri = await vscode.window.showSaveDialog({
            filters: { 'HTML': ['html'] },
            defaultUri: vscode.Uri.file('code-review-report.html')
        });
        
        if (uri) {
            await vscode.workspace.fs.writeFile(
                uri,
                Buffer.from(html, 'utf8')
            );
            vscode.window.showInformationMessage('Report exported successfully!');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Export failed: ${error.message}`);
    }
}

function deactivate() {
    if (outputChannel) {
        outputChannel.dispose();
    }
}

module.exports = {
    activate,
    deactivate
};