
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { getLogger } from '../utils/logger';
import { ensurePythonDependencies } from '../utils/python-dependency-checker';

export interface PythonEmbeddingResult {
    embedding: number[];
    dimensions: number;
    model: string;
    error?: string;
}

// Singleton persistent Python process
class PersistentPythonEmbedding {
    private process: ChildProcess | null = null;
    private isReady = false;
    private requestId = 0;
    private pendingRequests = new Map<number, {
        resolve: (value: number[]) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
    }>();
    private logger = getLogger('PersistentPythonEmbedding');
    private initializationPromise: Promise<void> | null = null;

    async initialize(): Promise<void> {
        // If already initialized, return immediately
        if (this.process && this.isReady) return;
        
        // If initialization is in progress, wait for it
        if (this.initializationPromise) {
            return this.initializationPromise;
        }
        
        // Start initialization
        this.initializationPromise = this.doInitialize();
        return this.initializationPromise;
    }

    private async doInitialize(): Promise<void> {
        if (this.process && this.isReady) return;

        this.logger.info('Starting persistent Python embedding process...');
        
        // Check Python dependencies before starting
        await ensurePythonDependencies(false, false);
        
        // Get model name from config
        const { ConfigManager } = await import('../config');
        const config = new ConfigManager(process.cwd());
        const aiConfig = config.getConfig().ai;
        const modelName = aiConfig.embedding.model;
        
        this.logger.info('Using Python embedding model', { model: modelName });
        
        // Python script is in src directory, not dist
        const projectRoot = path.resolve(__dirname, '..', '..');
        const scriptPath = path.join(projectRoot, 'src', 'python', 'embed_server.py');
        const workingDir = projectRoot;
        this.logger.info('Python script details', { scriptPath, workingDir, modelName });
        
        this.process = spawn('python3', [
            scriptPath,
            modelName  // Pass model name as argument
        ], {
            cwd: workingDir,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        if (!this.process.stdout || !this.process.stderr || !this.process.stdin) {
            throw new Error('Failed to create Python process with proper stdio');
        }

        // Handle stdin errors (like EPIPE)
        this.process.stdin.on('error', (error) => {
            this.logger.warn('Python process stdin error', { error: error.message });
            // Don't throw here, just log the error
        });

        // Handle process exit
        this.process.on('exit', (code) => {
            this.logger.warn('Python process exited', { code });
            this.isReady = false;
            this.initializationPromise = null; // Reset initialization promise
            this.rejectAllPending(new Error(`Python process exited with code ${code}`));
        });

        // Handle process errors
        this.process.on('error', (error) => {
            this.logger.error('Python process error', { error: error.message });
            this.isReady = false;
            this.initializationPromise = null; // Reset initialization promise
            this.rejectAllPending(new Error(`Python process error: ${error.message}`));
        });

        // Handle stdout data
        let buffer = '';
        this.process.stdout.on('data', (data: Buffer) => {
            buffer += data.toString();
            
            // Process complete JSON lines
            while (buffer.includes('\n')) {
                const lineEnd = buffer.indexOf('\n');
                const line = buffer.slice(0, lineEnd).trim();
                buffer = buffer.slice(lineEnd + 1);
                
                if (line) {
                    this.handleResponse(line);
                }
            }
        });

        // Handle stderr
        this.process.stderr.on('data', (data: Buffer) => {
            const errorText = data.toString().trim();
            if (errorText) {
                this.logger.warn('Python process stderr', { message: errorText });
                // If we see any stderr output, it might indicate an issue
                if (errorText.includes('ERROR') || errorText.includes('Exception') || errorText.includes('Traceback')) {
                    this.logger.error('Python process error detected', { error: errorText });
                }
            }
        });

        // Wait for initialization
        await this.waitForReady();
    }

    private async waitForReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Python process initialization timeout'));
            }, 600000); // 10 minutes timeout for model download and initial setup

            const checkReady = () => {
                if (this.isReady) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(checkReady, 100);
                }
            };
            checkReady();
        });
    }

    private handleResponse(line: string): void {
        try {
            const response = JSON.parse(line);
            
            if (response.type === 'ready') {
                this.isReady = true;
                this.logger.info('Python embedding process ready');
                return;
            }

            if (response.type === 'result' && typeof response.id === 'number') {
                const pending = this.pendingRequests.get(response.id);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingRequests.delete(response.id);
                    
                    if (response.error) {
                        pending.reject(new Error(`Python embedding error: ${response.error}`));
                    } else if (response.embedding && Array.isArray(response.embedding)) {
                        pending.resolve(response.embedding);
                    } else {
                        pending.reject(new Error('Invalid response format from Python'));
                    }
                }
            }
        } catch (error) {
            this.logger.error('Failed to parse Python response', { line, error });
        }
    }

    private rejectAllPending(error: Error): void {
        for (const [id, pending] of this.pendingRequests.entries()) {
            clearTimeout(pending.timeout);
            pending.reject(error);
        }
        this.pendingRequests.clear();
    }

    async generateEmbedding(text: string, isQuery: boolean = false): Promise<number[]> {
        if (!this.process || !this.isReady) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            const id = ++this.requestId;
            
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error('Python embedding request timeout'));
            }, 60000); // 1 minute timeout per embedding request

            this.pendingRequests.set(id, { resolve, reject, timeout });

            const request = {
                id,
                text,
                is_query: isQuery
            };

            try {
                const success = this.process!.stdin!.write(JSON.stringify(request) + '\n');
                if (!success) {
                    this.logger.warn('Python stdin buffer full, waiting for drain');
                }
            } catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(id);
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.error('Failed to write to Python process', { error: errorMessage });
                reject(new Error(`Failed to send request to Python: ${errorMessage}`));
            }
        });
    }

    async shutdown(): Promise<void> {
        if (this.process) {
            this.process.kill();
            this.process = null;
            this.isReady = false;
            this.initializationPromise = null;
        }
    }
}

// Global singleton instance
const persistentPython = new PersistentPythonEmbedding();

// Cleanup on process exit
process.on('exit', () => {
    persistentPython.shutdown().catch(() => {
        // Ignore cleanup errors on exit
    });
});

process.on('SIGINT', async () => {
    await persistentPython.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await persistentPython.shutdown();
    process.exit(0);
});

export async function getCodeEmbedding(
    text: string, 
    isQuery: boolean = false
): Promise<number[]> {
    return await persistentPython.generateEmbedding(text, isQuery);
}

/**
 * Generate embedding for a query (with prompt)
 */
export async function getPythonQueryEmbedding(query: string): Promise<number[]> {
    return getCodeEmbedding(query, true);
}

/**
 * Generate embedding for document content (without prompt)
 */
export async function getPythonDocumentEmbedding(text: string): Promise<number[]> {
    return getCodeEmbedding(text, false);
}

/**
 * Get detailed embedding result with metadata
 */
export async function getDetailedEmbedding(text: string, isQuery: boolean = false): Promise<PythonEmbeddingResult> {
    const embedding = await persistentPython.generateEmbedding(text, isQuery);
    
    // Get the actual model name from config
    const { ConfigManager } = await import('../config');
    const config = new ConfigManager(process.cwd());
    const modelName = config.getConfig().ai.embedding.model;
    
    return {
        embedding,
        dimensions: embedding.length,
        model: modelName
    };
}

/**
 * Shutdown the persistent Python process (useful for cleanup)
 */
export async function shutdownPythonEmbedding(): Promise<void> {
    await persistentPython.shutdown();
}
