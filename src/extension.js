const vscode = require('vscode');
const SidebarProvider = require('./sidebarProvider');
const AIService = require('./Services/AIservice');
const { initialize: initializeTools } = require('./Services/tools');
const {getResultHtml} = require('./UI/resultView')

let aiService;
let outputChannel;
let sidebarProvider;
let currentCancellationToken = null;

function activate(context) {
    console.log('AI CodeLensX extension activated');

    // Create output channel for logs
    outputChannel = vscode.window.createOutputChannel('AI Code Reviewer');
    
    // Initialize tools with output channel
    initializeTools(outputChannel);
    
    // Initialize AI Service
    aiService = new AIService(context, outputChannel);

    // Register sidebar
    sidebarProvider = new SidebarProvider(context, aiService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'CodeLensX.settingsView',
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
        'CodeLensX.reviewWorkspace',
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
        'CodeLensX.reviewFile',
        async () => {
            const editor = vscode.window.activeTextEditor;
            
            if (!editor) {
                vscode.window.showErrorMessage('No file open');
                return;
            }

            const fileDir = require('path').dirname(editor.document.uri.fsPath);
            await runReviewWithProgress(fileDir);
        }
    );

    // Open Settings Command
    const openSettings = vscode.commands.registerCommand(
        'CodeLensX.openSettings',
        () => {
            vscode.commands.executeCommand('CodeLensX.settingsView.focus');
        }
    );

    // Cancel Review Command
    const cancelReview = vscode.commands.registerCommand(
        'CodeLensX.cancelReview',
        () => {

            if (aiService) {
                aiService.cancel();
            }

            if (currentCancellationToken) {
                currentCancellationToken.cancel();
                currentCancellationToken = null;
            }

            outputChannel.appendLine('🛑 Cancel requested')
        }
    );

    const showReport = vscode.commands.registerCommand(
        'CodeLensX.showReport', 
        (results) => {
            // Create and show your report panel here
            showResultsPanel(results);
        }
    );

    context.subscriptions.push(
        reviewWorkspace,
        reviewFile,
        openSettings,
        showReport,
        cancelReview
    );
}

/**
 * Run review with VS Code progress notification
 */
async function runReviewWithProgress(directory) {
    // Show output channel
    outputChannel.show(true);
    outputChannel.clear();
    
    // Show progress in sidebar
    if (sidebarProvider) {
        sidebarProvider.showProgress();
    }
    
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "CodeLensX",
            cancellable: true
        },
        async (progress, token) => {
            try {
                // Store cancellation token
                currentCancellationToken = token;
                
                // Listen for cancellation
                token.onCancellationRequested(() => {
                    outputChannel.appendLine('⚠️ Review cancelled by user');
                    if (sidebarProvider) {
                        sidebarProvider.hideProgress();
                    }
                });

                // Progress callback that updates both notification and sidebar
                const progressCallback = ({ message, increment, fileInfo }) => {
                    progress.report({ 
                        message, 
                        increment 
                    });
                    
                    // Update sidebar progress
                    if (sidebarProvider && fileInfo) {
                        sidebarProvider._updateProgress(fileInfo);
                    }
                };

                // Run review
                const results = await aiService.runReview(
                    directory,
                    progressCallback,
                    token
                );

                // Hide progress view
                if (sidebarProvider) {
                    sidebarProvider.hideProgress();
                }

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
                // Hide progress view on error
                if (sidebarProvider) {
                    sidebarProvider.hideProgress();
                }
                
                vscode.window.showErrorMessage(
                    `Review failed: ${error.message}`
                );
                outputChannel.appendLine(`\n❌ Error: ${error.message}`);
                throw error;
            } finally {
                currentCancellationToken = null;
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
        vscode.ViewColumn.Beside,
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
                vscode.commands.executeCommand('CodeLensX.reviewWorkspace');
                break;
        }
    });
}

/**
 * Generate results HTML
 */
function getResultsHtml(results) {
    const totalIssues = results.security.length + results.bugs.length + results.quality.length;
    const summaryText = results.summary || 'Review completed successfully';
    
    return getResultHtml(results)

}

/**
 * Open file at specific line
 */
async function openFileAtLine(filePath, lineNumber) {
    try {
        const uri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);
        
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