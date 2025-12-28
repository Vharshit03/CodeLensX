const vscode = require('vscode');
function renderIssueSection(title, issues, className) {
        if (issues.length === 0) {
            return `
                <div class="issue-section">
                    <h2>${title} (0)</h2>
                    <div class="empty-state">No issues found</div>
                </div>
            `;
        }
        
        return `
            <div class="issue-section">
                <h2>${title} (${issues.length})</h2>
                ${issues.map(issue => `
                    <div class="issue-item ${className}" onclick="openFile('${issue.file}', ${issue.line})">
                        <div class="issue-file">${issue.file}${issue.line ? `:${issue.line}` : ''}</div>
                        <div class="issue-desc">${issue.description}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

function getResultHtml(results){
    const securityCount = results.security.length;
    const bugsCount = results.bugs.length;
    const qualityCount = results.quality.length;
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    padding: 30px;
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    line-height: 1.6;
                }

                .header {
                    text-align: center;
                    padding: 40px 20px;
                    background: linear-gradient(135deg, var(--vscode-button-background), var(--vscode-button-hoverBackground));
                    border-radius: 12px;
                    margin-bottom: 40px;
                }

                .header h1 {
                    font-size: 32px;
                    margin-bottom: 10px;
                    color: var(--vscode-button-foreground);
                }

                .header p {
                    font-size: 16px;
                    opacity: 0.9;
                    color: var(--vscode-button-foreground);
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin: 30px 0;
                }

                .stat-card {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 30px;
                    border-radius: 10px;
                    text-align: center;
                    border-left: 5px solid;
                    transition: transform 0.2s;
                }

                .stat-card:hover {
                    transform: translateY(-5px);
                }

                .stat-card.files { border-left-color: #3498db; }
                .stat-card.security { border-left-color: #e74c3c; }
                .stat-card.bugs { border-left-color: #f39c12; }
                .stat-card.quality { border-left-color: #2ecc71; }

                .stat-icon {
                    font-size: 40px;
                    margin-bottom: 10px;
                }

                .stat-value {
                    font-size: 48px;
                    font-weight: bold;
                    margin: 10px 0;
                    color: var(--vscode-foreground);
                }

                .stat-label {
                    font-size: 14px;
                    opacity: 0.8;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .summary-section {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 30px;
                    border-radius: 10px;
                    margin: 30px 0;
                }

                .summary-section h2 {
                    margin-bottom: 20px;
                    font-size: 24px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .summary-content {
                    white-space: pre-wrap;
                    line-height: 1.8;
                    color: var(--vscode-descriptionForeground);
                    font-size: 15px;
                    background: var(--vscode-editor-background);
                    padding: 20px;
                    border-radius: 8px;
                }

                .action-buttons {
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                    margin-top: 30px;
                }

                .btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 12px 30px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 15px;
                    font-weight: 600;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .btn:hover {
                    background: var(--vscode-button-hoverBackground);
                    transform: scale(1.05);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>✅ Code Review Complete</h1>
                <p>Analysis finished successfully</p>
            </div>

            <div class="stats-grid">
                <div class="stat-card files">
                    <div class="stat-icon">📁</div>
                    <div class="stat-value">${results.totalFiles || 0}</div>
                    <div class="stat-label">Files Analyzed</div>
                </div>

                <div class="stat-card security">
                    <div class="stat-icon">🔒</div>
                    <div class="stat-value">${securityCount}</div>
                    <div class="stat-label">Security Fixes</div>
                </div>

                <div class="stat-card bugs">
                    <div class="stat-icon">🐛</div>
                    <div class="stat-value">${bugsCount}</div>
                    <div class="stat-label">Bug Fixes</div>
                </div>

                <div class="stat-card quality">
                    <div class="stat-icon">✨</div>
                    <div class="stat-value">${qualityCount}</div>
                    <div class="stat-label">Quality Improvements</div>
                </div>
            </div>

            ${results.summary ? `
                <div class="summary-section">
                    <h2>📝 Review Summary</h2>
                    <div class="summary-content">${escapeHtml(results.summary)}</div>
                </div>
            ` : ''}

            <div class="action-buttons">
                <button class="btn" onclick="exportReport()">
                    <span>💾</span>
                    <span>Export Report</span>
                </button>
                <button class="btn" onclick="reviewAgain()">
                    <span>🔄</span>
                    <span>Review Again</span>
                </button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                function exportReport() {
                    vscode.postMessage({ command: 'exportReport' });
                }
                
                function reviewAgain() {
                    vscode.postMessage({ command: 'reviewAgain' });
                }
            </script>
        </body>
        </html>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

module.exports = {
   getResultHtml
}