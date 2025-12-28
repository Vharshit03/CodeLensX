const vscode = require('vscode');
const {
    getSetupView,
    getMainMenuView,
    getSettingsView,
    getSummaryView } = require('./UI/sidebarViews')


class SidebarProvider {
    constructor(context, aiService) {
        this._context = context;
        this._aiService = aiService;
        this._view = undefined;
        this.currentView = 'menu'; // 'setup', 'menu', 'settings', 'summary'
    }

    async resolveWebviewView(webviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };

        // Load initial view
        await this.updateView();

        // Listen for messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'validateKey':
                    await this._validateApiKey(message.apiKey);
                    break;
                case 'saveKey':
                    await this._saveApiKey(message.apiKey);
                    break;
                case 'deleteApiKey':
                    await this._deleteApiKey();
                    break;
                case 'changeView':
                    this.currentView = message.view;
                    await this.updateView();
                    break;
                case 'startReview':
                    await this._startReview(message.scope);
                    break;
                case 'openReport':
                    await this._openReport(message.reviewId);
                    break;
                case 'clearHistory':
                    await this._clearHistory();
                    break;
            }
        });
    }

    async updateView() {
        if (!this._view) return;

        // Check if API key exists
        const hasApiKey = await this._hasApiKey();
        
        // Force setup view if no API key
        if (!hasApiKey && this.currentView !== 'setup') {
            this.currentView = 'setup';
        }

        // Generate appropriate HTML
        let html;
        switch (this.currentView) {
            case 'setup':
                html = await this._getSetupView();
                break;
            case 'menu':
                html = await this._getMainMenuView();
                break;
            case 'settings':
                html = await this._getSettingsView();
                break;
            case 'summary':
                html = await this._getSummaryView();
                break;
            default:
                html = await this._getMainMenuView();
        }

        this._view.webview.html = html;
    }

    async _validateApiKey(apiKey) {
        if (!apiKey || apiKey.trim() === '') {
            this._sendMessage({
                type: 'validationResult',
                success: false,
                message: 'Please enter an API key'
            });
            return;
        }

        try {
            const { GoogleGenAI } = await import('@google/genai');
            const ai = new GoogleGenAI({ apiKey });

            const result = await ai.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents: [{
                    role: 'user',
                    parts: [{ text: 'Hello' }]
                }]
            });

            if (result && result.text) {
                this._sendMessage({
                    type: 'validationResult',
                    success: true,
                    message: 'API key is valid! ✓'
                });
            }
        } catch (error) {
            this._sendMessage({
                type: 'validationResult',
                success: false,
                message: `Invalid API key: Please give Valid API key`
            });
        }
    }

    async _saveApiKey(apiKey) {
        try {
            await this._context.secrets.store('googleAiApiKey', apiKey);
            
            this._sendMessage({
                type: 'saveResult',
                success: true,
                message: 'API key saved securely! ✓'
            });

            vscode.window.showInformationMessage('API key saved successfully!');
            
            // Switch to main menu
            this.currentView = 'menu';
            await this.updateView();
        } catch (error) {
            this._sendMessage({
                type: 'saveResult',
                success: false,
                message: `Failed to save: ${error.message}`
            });
        }
    }

    async _deleteApiKey() {

        try {
            const result = await vscode.window.showWarningMessage(
            'Are you sure you want to delete your API key?',
            {modal: true},
            'Delete',
            'Cancel'
        );
    
           if (result !== 'Delete') return;

            await this._context.secrets.delete('googleAiApiKey');
            vscode.window.showInformationMessage('API key deleted');
            this.currentView = 'setup';
            await this.updateView();
        } 
        catch (error) {
            vscode.window.showErrorMessage(`Failed to delete: ${error.message}`);
        }
    }

    async _startReview(scope) {
        if (scope === 'workspace') {
            vscode.commands.executeCommand('codelensx.reviewWorkspace');
        } else if (scope === 'file') {
            vscode.commands.executeCommand('codelensx.reviewFile');
        }
    }

    async _openReport(reviewId) {
        const history = this._context.globalState.get('reviewHistory', []);
        const review = history.find(r => r.id === reviewId);

        if (!review) {
        vscode.window.showErrorMessage(`Review ${reviewId} not found.`);
        return;
    }
        
        if (review) {
            // Reconstruct results and show panel
            const results = {
                totalFiles: review.totalFiles,
                filesFixed: review.filesFixed,
                security: Array(review.security).fill({ file: '', line: 0, description: 'Saved result' }),
                bugs: Array(review.bugs).fill({ file: '', line: 0, description: 'Saved result' }),
                quality: Array(review.quality).fill({ file: '', line: 0, description: 'Saved result' }),
                summary: review.summary || ''
            };
            
            vscode.commands.executeCommand('codelensx.showReport', results);
        }
    }

    async _clearHistory() {

         const result = await vscode.window.showWarningMessage(
            'Are you sure you want to delete your API key?',
            {modal: true},
            'Delete',
            'Cancel'
        );
    
        if (result !== 'Delete') return;

        await this._context.globalState.update('reviewHistory', []);
        await this.updateView();
        vscode.window.showInformationMessage('History cleared');
    }

    async _hasApiKey() {
        const apiKey = await this._context.secrets.get('googleAiApiKey');
        return !!apiKey;
    }

    async _getMaskedKey() {

        const apiKey = await this._context.secrets.get('googleAiApiKey');
        if (!apiKey) return null;
        return apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);
    }

    _sendMessage(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    // ========== VIEW TEMPLATES ==========

    async _getSetupView() {
        return getSetupView()
    }

    async _getMainMenuView() {
        const hasKey = await this._hasApiKey();
        return getMainMenuView()
    }

    async _getSettingsView() {
        const maskedKey = await this._getMaskedKey();
        return getSettingsView(maskedKey)
    }

    async _getSummaryView() {
        const history = this._context.globalState.get('reviewHistory', []);
        return getSummaryView(history)
    }

   
    

}

module.exports = SidebarProvider;