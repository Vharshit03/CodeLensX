const vscode = require("vscode");
const path = require("path");

// Output channel for logging (set by initialize)
let outputChannel = null;

function initialize(channel) {
    outputChannel = channel;
}

async function listFiles({directory}) {
    const files = [];
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css'];
    
    try {
        async function scan(dir) {
            const dirUri = vscode.Uri.file(dir);
            
            try {
                const items = await vscode.workspace.fs.readDirectory(dirUri);
                
                for (const [item, type] of items) {
                    const fullPath = path.join(dir, item);
                    
                    if (fullPath.includes('node_modules') || 
                        fullPath.includes('dist') || 
                        fullPath.includes('build')) continue;
                    
                    if (type === vscode.FileType.Directory) {
                        await scan(fullPath);
                    } else if (type === vscode.FileType.File) {
                        const ext = path.extname(item);
                        if (extensions.includes(ext)) {
                            files.push(fullPath);
                        }
                    }
                }
            } catch (err) {
                // Directory read failed, skip
            }
        }
        
        await scan(directory);
        
        if (outputChannel) {
            outputChannel.appendLine(`found ${files.length} files`);
        }
        
        return {files};
        
    } catch(err) {
        if (outputChannel) {
            outputChannel.appendLine(`error: ${err.message}`);
        }
        return {files: []};
    }
}

async function readFile({file_path}) {
    try {
        const uri = vscode.Uri.file(file_path);
        const contentBytes = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(contentBytes).toString('utf-8');
        
        if (outputChannel) {
            outputChannel.appendLine(`Reading: ${file_path}`);
        }
        
        return {content};
        
    } catch(error) {
        if (outputChannel) {
            outputChannel.appendLine(`Error: ${error.message}`);
        }
        return {content: ''};
    }
}

async function writeFile({file_path, content}) {
    try {
        const uri = vscode.Uri.file(file_path);
        
        // Check if file is currently open in editor
        const openEditor = vscode.window.visibleTextEditors.find(
            editor => editor.document.uri.fsPath === file_path
        );
        
        if (openEditor) {
            // File is open - use WorkspaceEdit for better UX
            const document = openEditor.document;
            const edit = new vscode.WorkspaceEdit();
            
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            
            edit.replace(uri, fullRange, content);
            await vscode.workspace.applyEdit(edit);
            await document.save();
        } else {
            // File is not open - direct write
            const contentBytes = Buffer.from(content, 'utf-8');
            await vscode.workspace.fs.writeFile(uri, contentBytes);
        }
        
        if (outputChannel) {
            outputChannel.appendLine(`Fixed: ${file_path}`);
        }
        
        return {success: true};
        
    } catch(error) {
        if (outputChannel) {
            outputChannel.appendLine(`Error: ${error.message}`);
        }
        return {success: false};
    }
}

// Tool definitions for Google GenAI
function getToolDefinitions() {
    // Hardcoded simple version - always works
    return [
        {
            name: "list_files",
            description: "Get all files",
            parameters: {
                type: "object",
                properties: {
                    directory: { type: "string", description: "Directory path" }
                },
                required: ["directory"]
            }
        },
        {
            name: "read_file",
            description: "Read file",
            parameters: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "File path" }
                },
                required: ["file_path"]
            }
        },
        {
            name: "write_file",
            description: "Write file",
            parameters: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "File path" },
                    content: { type: "string", description: "Content" }
                },
                required: ["file_path", "content"]
            }
        }
    ];
}

// Export tools object for easy access
const tools = {
    'list_files': listFiles,
    'read_file': readFile,
    'write_file': writeFile
};

module.exports = {
    initialize,
    listFiles,
    readFile,
    writeFile,
    tools,
    getToolDefinitions
};