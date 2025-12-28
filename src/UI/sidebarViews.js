const commonStyles = `
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        line-height: 1.6;
    }
    h2 {
        font-size: 18px;
        margin-bottom: 15px;
    }
    button {
        color: #bb9af7; /* Lavender foreground */
        background: transparent;
        border: 1px solid #bb9af7;
        padding: 8px 16px;
        cursor: pointer;
        border-radius: 4px;
        font-size: 13px;
        transition: background 0.2s;
    }
    button:hover {
       background: #bb9af7;
      color: #16161e;
    }
    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

function getSetupView() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        ${commonStyles}
        .setup-container {
            padding: 20px;
        }
        .info-box {
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
            padding: 12px;
            margin: 15px 0;
            font-size: 13px;
        }
        .info-box a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        input {
            width: 100%;
            padding: 8px;
            margin: 10px 0;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        .button-group {
            display: flex;
            gap: 8px;
            margin-top: 15px;
        }
        .message {
            padding: 10px;
            margin-top: 15px;
            border-radius: 4px;
            display: none;
        }
        .message.success {
            background: rgba(16, 185, 129, 0.15);
            color: var(--vscode-testing-iconPassed);
        }
        .message.error {
            background: rgba(239, 68, 68, 0.15);
            color: var(--vscode-testing-iconFailed);
        }
        .spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid currentColor;
            border-top: 2px solid transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="setup-container">
        <h2>🔑 Setup Required</h2>
        
        <div class="info-box">
            Get your API key from 
            <a href="https://aistudio.google.com/app/apikey" target="_blank">
                Google AI Studio →
            </a>
        </div>

        <label>API Key:</label>
        <input type="password" id="apiKey" placeholder="Enter your API key...">
        
        <div class="button-group">
            <button id="validateBtn" onclick="validateKey()">Validate Key</button>
            <button id="saveBtn" onclick="saveKey()" disabled>Save Key</button>
        </div>

        <div id="message" class="message"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let isValidated = false;

        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.type === 'validationResult') {
                const validateBtn = document.getElementById('validateBtn');
                const saveBtn = document.getElementById('saveBtn');
                
                validateBtn.disabled = false;
                validateBtn.textContent = 'Validate Key';
                
                showMessage(message.message, message.success);
                
                if (message.success) {
                    isValidated = true;
                    saveBtn.disabled = false;
                } else {
                    isValidated = false;
                    saveBtn.disabled = true;
                }
            }
            
            if (message.type === 'saveResult' && message.success) {
                showMessage(message.message, true);
            }
        });

        function validateKey() {
            const apiKey = document.getElementById('apiKey').value;
            const validateBtn = document.getElementById('validateBtn');
            
            if (!apiKey.trim()) {
                showMessage('Please enter an API key', false);
                return;
            }

            validateBtn.disabled = true;
            validateBtn.innerHTML = '<span class="spinner"></span> Validating...';
            
            vscode.postMessage({
                type: 'validateKey',
                apiKey: apiKey
            });
        }

        function saveKey() {
            const apiKey = document.getElementById('apiKey').value;
            
            if (!isValidated) {
                showMessage('Please validate the key first', false);
                return;
            }

            vscode.postMessage({
                type: 'saveKey',
                apiKey: apiKey
            });
        }

        function showMessage(text, isSuccess) {
            const message = document.getElementById('message');
            message.textContent = text;
            message.className = 'message ' + (isSuccess ? 'success' : 'error');
            message.style.display = 'block';
        }
    </script>
</body>
</html>`;
}

function getMainMenuView() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        ${commonStyles}
        .menu-container {
            padding: 20px;
            display:flex;
            flex-direction:column;
        }
        .bar{
        display:flex;
        justify-content: space-between;
        }
        .status {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 20px;
            background: rgba(16, 185, 129, 0.2);
            color: var(--vscode-testing-iconPassed);
        }
        .menu-button {
            padding: 15px;
            margin: 10px 0;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            text-align: left;
            transition: background 0.2s;
        }
        .menu-button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .menu-button-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .menu-button-desc {
            font-size: 12px;
            opacity: 0.8;
        }
        .stbar{
            background:none;
            padding:0px 0px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="menu-container">
        <h2>codelensx</h2>
        <div class="bar">
        <div class="status">✅ Configured</div>
        <button class="stbar" onclick="showSettings()">⚙️</button>
        </div>
        

        <button class="menu-button" onclick="reviewWorkspace()">
            <div class="menu-button-title">▶️ Review Workspace</div>
            <div class="menu-button-desc">Analyze all files in workspace</div>
        </button>

        <button class="menu-button" onclick="reviewFile()">
            <div class="menu-button-title">📄 Review Current File</div>
            <div class="menu-button-desc">Analyze active file only</div>
        </button>

        <button class="menu-button" onclick="showSummary()">
            <div class="menu-button-title">📊 View Summary</div>
            <div class="menu-button-desc">See review history</div>
        </button>

        <button class="menu-button" onclick="showSettings()">
            <div class="menu-button-title">⚙️ Settings</div>
            <div class="menu-button-desc">Manage configuration</div>
        </button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function reviewWorkspace() {
            vscode.postMessage({
                type: 'startReview',
                scope: 'workspace'
            });
        }

        function reviewFile() {
            vscode.postMessage({
                type: 'startReview',
                scope: 'file'
            });
        }

        function showSummary() {
            vscode.postMessage({
                type: 'changeView',
                view: 'summary'
            });
        }

        function showSettings() {
            vscode.postMessage({
                type: 'changeView',
                view: 'settings'
            });
        }
    </script>
</body>
</html>`;
}

function getSettingsView(maskedKey) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        ${commonStyles}
        .settings-container {
            padding: 20px;
        }
        .back-button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            margin-bottom: 20px;
        }
        .back-button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .setting-item {
            background: var(--vscode-editor-background);
            padding: 15px;
            min-width: 300px;
            margin: 15px 0;
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }
        .setting-label {
            font-size: 12px;
            opacity: 0.8;
            margin-bottom: 5px;
        }
        .setting-value {
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            margin-bottom: 10px;
        }
        .danger-button {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }
        .danger-button:hover {
            background: rgba(239, 68, 68, 0.3);
        }
    </style>
</head>
<body>
    <div class="settings-container">
        <button class="back-button" onclick="goBack()">⬅️ Back to Menu</button>
        
        <h2>Settings</h2>

        <div class="setting-item">
            <div class="setting-label">API Key Status</div>
            <div class="setting-value">✅ Configured (${maskedKey})</div>
            
            <button onclick="changeKey()">
                🔄 Change API Key
            </button>
            
            <button class="danger-button" onclick="deleteKey()">
                🗑️ Delete API Key
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function goBack() {
            vscode.postMessage({
                type: 'changeView',
                view: 'menu'
            });
        }

        function deleteKey() {
            vscode.postMessage({
                type: 'deleteApiKey'
            });
        }

        function changeKey() {
            vscode.postMessage({
                type: 'changeView',
                view: 'setup'
            });
        }
    </script>
</body>
</html>`;
}

function getSummaryView(history) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        ${commonStyles}
        .summary-container {
            padding: 20px;
        }
        .back-button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            margin-bottom: 20px;
        }
        .review-card {
            background: var(--vscode-editor-background);
            padding: 15px;
            margin: 10px 0;
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }
        .review-header {
            font-weight: 600;
            margin-bottom: 8px;
        }
        .review-stats {
            display: flex;
            gap: 15px;
            margin: 10px 0;
            font-size: 12px;
        }
        .stat {
            opacity: 0.8;
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            opacity: 0.6;
        }
        .danger-button {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
            margin-top: 20px;
        }
        .danger-button:hover {
            background: rgba(239, 68, 68, 0.3);
        }
    </style>
</head>
<body>
    <div class="summary-container">
        <button class="back-button" onclick="goBack()">⬅️ Back to Menu</button>
        
        <h2>Review History</h2>

        ${history.length === 0 ? `
            <div class="empty-state">
                <p>No reviews yet</p>
                <p style="font-size: 12px;">Run a review to see history here</p>
            </div>
        ` : history.map(review => `
            <div class="review-card">
                <div class="review-header">
                    Review #${review.id}
                </div>
                <div style="font-size: 12px; opacity: 0.7; margin-bottom: 10px;">
                    ${new Date(review.timestamp).toLocaleString()}
                </div>
                <div class="review-stats">
                    <div class="stat">📁 ${review.totalFiles} files</div>
                    <div class="stat">✅ ${review.filesFixed} fixed</div>
                    <div class="stat">🔴 ${review.security}</div>
                    <div class="stat">🟠 ${review.bugs}</div>
                    <div class="stat">🟡 ${review.quality}</div>
                </div>
                <button onclick="viewReport(${review.id})">
                    View Report
                </button>
            </div>
        `).join('')}

        ${history.length > 0 ? `
            <button class="danger-button" onclick="clearHistory()">
                Clear History
            </button>
        ` : ''}
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function goBack() {
            vscode.postMessage({
                type: 'changeView',
                view: 'menu'
            });
        }

        function viewReport(id) {
            vscode.postMessage({
                type: 'openReport',
                reviewId: id
            });
        }

        function clearHistory() {
            vscode.postMessage({
                type: 'clearHistory'
            });
        }
    </script>
</body>
</html>`;
}



module.exports = {
    getSetupView,
    getMainMenuView,
    getSettingsView,
    getSummaryView,
};