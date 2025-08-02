/**
 * Python dependency checker and installer for hikma-engine
 * Ensures Python dependencies are available when using Python-based features
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { getLogger } from './logger';
import chalk from 'chalk';

const execAsync = promisify(exec);
const logger = getLogger('PythonDependencyChecker');

export interface PythonEnvironmentInfo {
  pythonAvailable: boolean;
  pythonVersion?: string;
  pipAvailable: boolean;
  dependenciesInstalled: boolean;
  missingDependencies: string[];
  installationPath?: string;
}

export class PythonDependencyChecker {
  private static instance: PythonDependencyChecker;
  private cachedEnvironmentInfo: PythonEnvironmentInfo | null = null;
  private readonly requiredPackages = ['transformers', 'torch', 'accelerate'];

  static getInstance(): PythonDependencyChecker {
    if (!PythonDependencyChecker.instance) {
      PythonDependencyChecker.instance = new PythonDependencyChecker();
    }
    return PythonDependencyChecker.instance;
  }

  /**
   * Check if Python and required dependencies are available
   */
  async checkEnvironment(useCache: boolean = true): Promise<PythonEnvironmentInfo> {
    if (useCache && this.cachedEnvironmentInfo) {
      return this.cachedEnvironmentInfo;
    }

    logger.info('Checking Python environment...');
    
    const envInfo: PythonEnvironmentInfo = {
      pythonAvailable: false,
      pipAvailable: false,
      dependenciesInstalled: false,
      missingDependencies: []
    };

    try {
      // Check Python availability and version
      const pythonResult = await this.runCommand('python3 --version');
      if (pythonResult.success) {
        envInfo.pythonAvailable = true;
        envInfo.pythonVersion = pythonResult.stdout.trim();
        logger.info('Python found', { version: envInfo.pythonVersion });
      } else {
        // Try 'python' command as fallback
        const pythonFallback = await this.runCommand('python --version');
        if (pythonFallback.success && pythonFallback.stdout.includes('Python 3')) {
          envInfo.pythonAvailable = true;
          envInfo.pythonVersion = pythonFallback.stdout.trim();
          logger.info('Python found (via python command)', { version: envInfo.pythonVersion });
        }
      }

      if (!envInfo.pythonAvailable) {
        logger.warn('Python 3 not found in PATH');
        this.cachedEnvironmentInfo = envInfo;
        return envInfo;
      }

      // Check pip availability
      const pipResult = await this.runCommand('python3 -m pip --version');
      envInfo.pipAvailable = pipResult.success;
      
      if (!envInfo.pipAvailable) {
        logger.warn('pip not available');
        this.cachedEnvironmentInfo = envInfo;
        return envInfo;
      }

      // Check required packages
      const missingPackages = await this.checkRequiredPackages();
      envInfo.missingDependencies = missingPackages;
      envInfo.dependenciesInstalled = missingPackages.length === 0;

      if (envInfo.dependenciesInstalled) {
        logger.info('All Python dependencies are installed');
      } else {
        logger.warn('Missing Python dependencies', { missing: missingPackages });
      }

    } catch (error) {
      logger.error('Error checking Python environment', { error: error instanceof Error ? error.message : String(error) });
    }

    this.cachedEnvironmentInfo = envInfo;
    return envInfo;
  }

  /**
   * Check which required packages are missing
   */
  private async checkRequiredPackages(): Promise<string[]> {
    const missingPackages: string[] = [];

    for (const packageName of this.requiredPackages) {
      const result = await this.runCommand(`python3 -c "import ${packageName}; print('${packageName} OK')"`);;
      if (!result.success) {
        missingPackages.push(packageName);
      }
    }

    return missingPackages;
  }

  /**
   * Install missing Python dependencies
   */
  async installDependencies(interactive: boolean = true): Promise<boolean> {
    const envInfo = await this.checkEnvironment(false);
    
    if (!envInfo.pythonAvailable) {
      throw new Error('Python 3 is not available. Please install Python 3.8 or later.');
    }

    if (!envInfo.pipAvailable) {
      throw new Error('pip is not available. Please install pip.');
    }

    if (envInfo.dependenciesInstalled) {
      logger.info('All dependencies are already installed');
      return true;
    }

    if (interactive) {
      console.log(chalk.yellow('\n⚠️  Missing Python dependencies for hikma-engine:'));
      envInfo.missingDependencies.forEach(pkg => {
        console.log(chalk.red(`   - ${pkg}`));
      });
      console.log(chalk.blue('\n📦 Installing dependencies...'));
    }

    try {
      // Get the requirements.txt path
      const requirementsPath = this.getRequirementsPath();
      
      if (fs.existsSync(requirementsPath)) {
        logger.info('Installing from requirements.txt', { path: requirementsPath });
        const result = await this.runCommand(`python3 -m pip install -r "${requirementsPath}"`, 300000); // 5 minute timeout
        
        if (result.success) {
          if (interactive) {
            console.log(chalk.green('✅ Python dependencies installed successfully!'));
          }
          logger.info('Python dependencies installed successfully');
          this.cachedEnvironmentInfo = null; // Clear cache
          return true;
        } else {
          throw new Error(`Installation failed: ${result.stderr}`);
        }
      } else {
        // Fallback: install packages individually
        logger.info('requirements.txt not found, installing packages individually');
        
        for (const packageName of envInfo.missingDependencies) {
          const result = await this.runCommand(`python3 -m pip install ${packageName}`, 300000);
          if (!result.success) {
            throw new Error(`Failed to install ${packageName}: ${result.stderr}`);
          }
        }
        
        if (interactive) {
          console.log(chalk.green('✅ Python dependencies installed successfully!'));
        }
        logger.info('Python dependencies installed successfully');
        this.cachedEnvironmentInfo = null; // Clear cache
        return true;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to install Python dependencies', { error: errorMessage });
      
      if (interactive) {
        console.log(chalk.red('❌ Failed to install Python dependencies'));
        console.log(chalk.yellow('\n💡 Manual installation instructions:'));
        console.log(chalk.gray('   1. Ensure Python 3.8+ is installed'));
        console.log(chalk.gray('   2. Run: pip3 install transformers torch accelerate'));
        console.log(chalk.gray('   3. Or install from requirements.txt if available'));
      }
      
      throw new Error(`Python dependency installation failed: ${errorMessage}`);
    }
  }

  /**
   * Get the path to requirements.txt
   */
  private getRequirementsPath(): string {
    // Try multiple possible locations
    const possiblePaths = [
      // When running from source
      path.join(__dirname, '..', 'python', 'requirements.txt'),
      // When installed as npm package
      path.join(__dirname, '..', '..', 'src', 'python', 'requirements.txt'),
      // Alternative npm package structure
      path.join(process.cwd(), 'node_modules', 'hikma-engine', 'src', 'python', 'requirements.txt'),
      // Current directory (for development)
      path.join(process.cwd(), 'src', 'python', 'requirements.txt')
    ];

    for (const reqPath of possiblePaths) {
      if (fs.existsSync(reqPath)) {
        logger.debug('Found requirements.txt', { path: reqPath });
        return reqPath;
      }
    }

    logger.warn('requirements.txt not found in any expected location');
    return '';
  }

  /**
   * Display helpful setup instructions
   */
  displaySetupInstructions(): void {
    console.log(chalk.blue('\n🐍 Python Setup Instructions for hikma-engine'));
    console.log(chalk.gray('=' .repeat(50)));
    console.log(chalk.white('\n1. Install Python 3.8 or later:'));
    console.log(chalk.gray('   - macOS: brew install python3'));
    console.log(chalk.gray('   - Ubuntu: sudo apt install python3 python3-pip'));
    console.log(chalk.gray('   - Windows: Download from python.org'));
    
    console.log(chalk.white('\n2. Install required packages:'));
    console.log(chalk.cyan('   pip3 install transformers torch accelerate'));
    
    console.log(chalk.white('\n3. Verify installation:'));
    console.log(chalk.cyan('   python3 -c "import transformers, torch; print(\'Dependencies OK\')"'));
    
    console.log(chalk.white('\n4. Configure hikma-engine to use Python:'));
    console.log(chalk.cyan('   export HIKMA_EMBEDDING_PROVIDER=python'));
    
    console.log(chalk.gray('\nFor more information, visit: https://github.com/foyzulkarim/hikma-engine#python-provider-setup'));
  }

  /**
   * Run a shell command with timeout
   */
  private async runCommand(command: string, timeout: number = 30000): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = exec(command, { timeout }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, stdout: stdout || '', stderr: stderr || error.message });
        } else {
          resolve({ success: true, stdout: stdout || '', stderr: stderr || '' });
        }
      });

      // Handle timeout
      setTimeout(() => {
        child.kill();
        resolve({ success: false, stdout: '', stderr: 'Command timeout' });
      }, timeout);
    });
  }

  /**
   * Clear cached environment info (useful for testing)
   */
  clearCache(): void {
    this.cachedEnvironmentInfo = null;
  }
}

/**
 * Convenience function to check and optionally install Python dependencies
 */
export async function ensurePythonDependencies(autoInstall: boolean = false, interactive: boolean = true): Promise<PythonEnvironmentInfo> {
  const checker = PythonDependencyChecker.getInstance();
  const envInfo = await checker.checkEnvironment();

  if (!envInfo.pythonAvailable) {
    if (interactive) {
      console.log(chalk.red('❌ Python 3 is not available'));
      checker.displaySetupInstructions();
    }
    throw new Error('Python 3 is required for Python-based features. Please install Python 3.8 or later.');
  }

  if (!envInfo.dependenciesInstalled) {
    if (autoInstall) {
      await checker.installDependencies(interactive);
      return await checker.checkEnvironment(false); // Re-check after installation
    } else if (interactive) {
      console.log(chalk.yellow('⚠️  Python dependencies are missing'));
      console.log(chalk.blue('Run with --install-python-deps to install automatically, or:'));
      checker.displaySetupInstructions();
    }
    throw new Error('Required Python dependencies are missing. Please install them or run with --install-python-deps.');
  }

  return envInfo;
}

/**
 * Check if Python environment is ready (non-throwing version)
 */
export async function isPythonEnvironmentReady(): Promise<boolean> {
  try {
    const checker = PythonDependencyChecker.getInstance();
    const envInfo = await checker.checkEnvironment();
    return envInfo.pythonAvailable && envInfo.dependenciesInstalled;
  } catch {
    return false;
  }
}