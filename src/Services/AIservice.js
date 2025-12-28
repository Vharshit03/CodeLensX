// @ts-nocheck
const vscode = require('vscode');
const { tools, getToolDefinitions } = require('./tools');

class AIService {
    constructor(context, outputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
        this.ai = null;
    }

    async initialize() {
        try {
            const apiKey = await this.context.secrets.get('googleAiApiKey');
            
            if (!apiKey) {
                throw new Error('API key not configured');
            }

            const { GoogleGenAI } = await import('@google/genai');
            this.ai = new GoogleGenAI({ apiKey });
            
            this.log('✅ AI Service initialized');
            return true;
            
        } catch (error) {
            this.log(`❌ Failed to initialize: ${error.message}`);
            throw error;
        }
    }

    async runReview(directory, progressCallback) {
        try {
            if (!this.ai) {
                await this.initialize();
            }

            this.log(`🔍 Reviewing: ${directory}\n`);
            
            const results = {
                totalFiles: 0,
                filesFixed: 0,
                security: [],
                bugs: [],
                quality: [],
                summary: '',
                details: []
            };

            await this.runAgent(directory, results, progressCallback);

            return results;

        } catch (error) {
            this.log(`❌ Review failed: ${error.message}`);
            throw error;
        }
    }

    async runAgent(directory, results, progressCallback) {
        const History = [{
            role: 'user',
            parts: [{ text: `Review and fix all code in: ${directory}` }]
        }];

        let iteration = 0;
        const maxIterations = 30; // Reduced for speed

        while (iteration < maxIterations) {
            iteration++;
            
            if (progressCallback) {
                progressCallback({
                    message: `Processing... (${iteration}/${maxIterations})`,
                    increment: 20 + (iteration / maxIterations * 60)
                });
            }

            try {
                const result = await this.ai.models.generateContent({
                    model: "gemini-2.0-flash-exp",
                    contents: History,
                    config: {
                        systemInstruction: this.getSystemPrompt(),
                        tools: [{
                            functionDeclarations: getToolDefinitions()
                        }],
                        temperature: 0.1, // Lower for faster, more focused responses
                    }
                });

                if (result.functionCalls?.length > 0) {
                    // Execute all function calls from AI
                    for (const functionCall of result.functionCalls) {
                        const { name, args } = functionCall;
                        
                        this.log(`📌 ${name}`);
                        
                        // Execute the tool
                        const toolResponse = await tools[name](args);
                        
                        // Track stats and collect issue details
                        if (name === 'list_files' && toolResponse.files) {
                            results.totalFiles = toolResponse.files.length;
                        }
                        if (name === 'write_file' && toolResponse.success) {
                            results.filesFixed++;
                            // Extract issue from the fix
                            const issue = this.extractIssueFromFix(args.file_path, args.content);
                            results.details.push(issue);
                            this.categorizeIssue(issue, results);
                        }
                        
                        // Add to history
                        History.push({
                            role: 'model',
                            // @ts-ignore
                            parts: [{ functionCall }]
                        });
                        
                        History.push({
                            role: 'user',
                            // @ts-ignore
                            parts: [{
                                functionResponse: {
                                    name,
                                    response: toolResponse
                                }
                            }]
                        });
                    }
                } else {
                    // Final response - AI is done
                    const summaryText = result.text || '';
                    results.summary = summaryText;
                    this.log('\n' + summaryText);
                    
                    // Parse the summary to extract any additional info
                    this.parseSummary(summaryText, results);
                    break;
                }

            } catch (error) {
                this.log(`Error in iteration ${iteration}: ${error.message}`);
                if (iteration > 3) throw error;
            }
        }

        if (iteration >= maxIterations) {
            this.log('⚠️ Reached maximum iterations');
            results.summary = `Review completed with ${results.filesFixed} files fixed out of ${results.totalFiles} analyzed.`;
        }
    }

    extractIssueFromFix(filePath, content) {
        // Extract meaningful info from the fixed content
        const fileName = filePath.split(/[/\\]/).pop();
        let description = 'Code improved';
        let severity = 'quality';
        
        const contentLower = content.toLowerCase();
        
        // Detect issue type from content
        if (contentLower.includes('api') && contentLower.includes('key')) {
            description = 'Removed hardcoded API key';
            severity = 'security';
        } else if (contentLower.includes('password') || contentLower.includes('secret')) {
            description = 'Fixed hardcoded credentials';
            severity = 'security';
        } else if (contentLower.includes('xss') || contentLower.includes('injection')) {
            description = 'Fixed security vulnerability';
            severity = 'security';
        } else if (contentLower.includes('null') || contentLower.includes('undefined')) {
            description = 'Added null/undefined check';
            severity = 'bug';
        } else if (contentLower.includes('error') || contentLower.includes('catch')) {
            description = 'Improved error handling';
            severity = 'bug';
        } else if (contentLower.includes('async') || contentLower.includes('await')) {
            description = 'Fixed async/await issue';
            severity = 'bug';
        } else if (contentLower.includes('console.log')) {
            description = 'Removed debug statements';
            severity = 'quality';
        } else if (contentLower.includes('//') || contentLower.includes('/*')) {
            description = 'Added code documentation';
            severity = 'quality';
        }
        
        return {
            file: fileName,
            fullPath: filePath,
            line: 0,
            description,
            severity
        };
    }

    categorizeIssue(issue, results) {
        const issueObj = {
            file: issue.file,
            fullPath: issue.fullPath,
            line: issue.line,
            description: issue.description
        };
        
        if (issue.severity === 'security') {
            results.security.push(issueObj);
        } else if (issue.severity === 'bug') {
            results.bugs.push(issueObj);
        } else {
            results.quality.push(issueObj);
        }
    }

    parseSummary(text, results) {
        if (!text) return;
        
        const lines = text.split('\n');
        
        for (const line of lines) {
            // Extract numbers from summary lines
            if (line.includes('Files Analyzed') || line.includes('Total Files')) {
                const match = line.match(/(\d+)/);
                if (match && results.totalFiles === 0) {
                    results.totalFiles = parseInt(match[1]);
                }
            }
            
            if (line.includes('Files Fixed') || line.includes('Fixed')) {
                const match = line.match(/(\d+)/);
                if (match) {
                    const fixedCount = parseInt(match[1]);
                    if (fixedCount > results.filesFixed) {
                        results.filesFixed = fixedCount;
                    }
                }
            }
            
            // Parse issue lines with format: "- file.js:line - description"
            if (line.trim().startsWith('-') && line.includes(':')) {
                const parts = line.split(' - ');
                if (parts.length >= 2) {
                    const filePart = parts[0].replace('-', '').trim();
                    const desc = parts.slice(1).join(' - ').trim();
                    
                    const issue = {
                        file: filePart.split(':')[0],
                        fullPath: filePart.split(':')[0],
                        line: parseInt(filePart.split(':')[1]) || 0,
                        description: desc
                    };
                    
                    // Categorize based on section in summary
                    const prevLines = lines.slice(Math.max(0, lines.indexOf(line) - 5), lines.indexOf(line)).join(' ').toLowerCase();
                    
                    if (prevLines.includes('security') || prevLines.includes('🔴')) {
                        if (!results.security.find(i => i.file === issue.file && i.description === issue.description)) {
                            results.security.push(issue);
                        }
                    } else if (prevLines.includes('bug') || prevLines.includes('🟠')) {
                        if (!results.bugs.find(i => i.file === issue.file && i.description === issue.description)) {
                            results.bugs.push(issue);
                        }
                    } else if (prevLines.includes('quality') || prevLines.includes('🟡')) {
                        if (!results.quality.find(i => i.file === issue.file && i.description === issue.description)) {
                            results.quality.push(issue);
                        }
                    }
                }
            }
        }
    }

    getSystemPrompt() {
        return `You are an expert code reviewer. Work QUICKLY and EFFICIENTLY.

**Your Job:**
1. Use list_files to scan the directory
2. Use read_file to check each file for issues
3. Use write_file ONLY for files with real problems
4. After fixing, provide a summary report

**Focus on these critical issues:**
🔴 SECURITY: API keys, passwords, XSS, injection
🟠 BUGS: null/undefined errors, async issues, type errors
🟡 QUALITY: console.logs, unused code, poor naming

**Work efficiently:**
- Skip files with no issues
- Fix multiple issues per file at once
- Don't over-analyze - focus on real problems
- Be concise in explanations

**Summary Format:**
📊 CODE REVIEW COMPLETE

Total Files Analyzed: X
Files Fixed: Y

🔴 SECURITY FIXES (Z):
- file.js:12 - Fixed hardcoded API key
- auth.js:45 - Removed eval() usage

🟠 BUG FIXES (Z):
- app.js:78 - Added null check
- utils.js:34 - Fixed async/await

🟡 QUALITY (Z):
- index.js:23 - Removed console.log
- style.css:156 - Removed duplicate styles

Work fast and fix real issues only.`;
    }

    log(message) {
        if (this.outputChannel) {
            this.outputChannel.appendLine(message);
        }
    }
}

module.exports = AIService;